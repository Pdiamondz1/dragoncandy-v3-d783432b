// Thin Zernio IO adapter — implements the SocialProvider contract over fetch +
// the pure zernio-map mappers. Each method is just: build URL → fetch → run the
// matching pure mapper. NO business logic, NO DB, NO Deno.env reads (config is
// injected by the social-proxy gateway factory in Task 7), so it stays unit-
// testable with a mocked fetch.
//
// Several Zernio endpoint paths/fields are not yet pinned against captured API
// shapes — these are FLAGGED inline with `// FLAG:` and use the documented best
// guess. They are reconciled once we have a live Zernio key (Phase 2/3).

import { verifyOutstandSignature } from '../../_shared/outstand-webhook-lib.ts';
import type {
  AccountAnalytics,
  Comment,
  MediaUploadInput,
  NormalizedEvent,
  Platform,
  PostAnalytics,
  PostInput,
  PostResult,
  ProviderPost,
  SocialAccount,
  SocialProvider,
  TenantCtx,
} from '../../_shared/social-contract.ts';
import {
  PLATFORM_TO_ZERNIO,
  fromZernioAccount,
  fromZernioAccountAnalytics,
  fromZernioComment,
  fromZernioPost,
  fromZernioPostAnalytics,
  fromZernioPostResult,
  normalizeZernioWebhook,
  toZernioCreatePost,
} from './zernio-map.ts';

export interface ZernioAdapterDeps {
  apiKey: string;
  baseUrl: string; // e.g. Deno.env ZERNIO_BASE_URL ?? 'https://api.zernio.com/v1'
  accountPlatforms: Record<string, Platform>; // accountId → platform, supplied by the gateway
  webhookSecret?: string;
  fetchImpl?: typeof fetch; // injectable for tests; default globalThis.fetch
}

export function createZernioAdapter(deps: ZernioAdapterDeps): SocialProvider {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const base = deps.baseUrl.replace(/\/$/, '');

  /** Build URL + fetch with bearer; throw on non-2xx; return parsed JSON. */
  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${deps.apiKey}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (path.startsWith('/analytics') && res.status === 402) {
        throw new Error('Zernio analytics add-on required (HTTP 402)');
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Zernio ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return await res.json();
  }

  return {
    async getConnectUrl(platform: Platform, redirectUri: string, _ctx: TenantCtx) {
      // FLAG: connect path + response field unconfirmed. Best guess:
      //   GET /connect/{zernioPlatform}?redirectUri=... → { url | connectUrl | authUrl }.
      const zPlatform = PLATFORM_TO_ZERNIO[platform];
      const q = `?redirectUri=${encodeURIComponent(redirectUri)}`;
      const raw = (await request('GET', `/connect/${zPlatform}${q}`)) as Record<string, unknown>;
      const url = (raw?.url ?? raw?.connectUrl ?? raw?.authUrl) as string | undefined;
      return { url: url ?? '' };
    },

    finalizeConnection(_params: unknown, _ctx: TenantCtx): Promise<SocialAccount[]> {
      // FLAG: Zernio OAuth finalize shape unconfirmed; Phase 2 wires the real
      // callback. For now the connect flow returns accounts via listAccounts.
      return Promise.resolve([]);
    },

    async listAccounts(_ctx: TenantCtx): Promise<SocialAccount[]> {
      const raw = (await request('GET', '/accounts')) as unknown[];
      return (Array.isArray(raw) ? raw : []).map((a) => fromZernioAccount(a as never));
    },

    async disconnect(accountId: string, _ctx: TenantCtx): Promise<void> {
      await request('DELETE', `/accounts/${accountId}`);
    },

    async uploadMedia(file: MediaUploadInput, _ctx: TenantCtx): Promise<{ id: string; url: string }> {
      // FLAG: media endpoint unconfirmed. Best guess: POST /media → { id, url }.
      const raw = (await request('POST', '/media', file)) as Record<string, unknown>;
      return { id: String(raw?.id ?? ''), url: String(raw?.url ?? '') };
    },

    async createPost(input: PostInput, _ctx: TenantCtx): Promise<PostResult> {
      const body = toZernioCreatePost(input, deps.accountPlatforms);
      return fromZernioPostResult((await request('POST', '/posts', body)) as never);
    },

    async getPost(providerPostId: string, _ctx: TenantCtx): Promise<ProviderPost> {
      return fromZernioPost((await request('GET', `/posts/${providerPostId}`)) as never);
    },

    async deletePost(providerPostId: string, _ctx: TenantCtx): Promise<void> {
      await request('DELETE', `/posts/${providerPostId}`);
    },

    async getPostAnalytics(providerPostId: string, _ctx: TenantCtx): Promise<PostAnalytics> {
      const raw = await request('GET', `/analytics?postId=${encodeURIComponent(providerPostId)}`);
      return fromZernioPostAnalytics(raw);
    },

    async getAccountAnalytics(accountId: string, _ctx: TenantCtx): Promise<AccountAnalytics> {
      // FLAG: followers source (accountStats) lives on this aggregate shape but
      // is not yet observed live — fromZernioAccountAnalytics defaults it to 0.
      const raw = await request('GET', `/analytics?accountId=${encodeURIComponent(accountId)}`);
      return fromZernioAccountAnalytics(raw);
    },

    async listComments(providerPostId: string, _ctx: TenantCtx): Promise<Comment[]> {
      // FLAG: inbox/comments endpoint unconfirmed.
      const raw = (await request(
        'GET',
        `/inbox/comments?postId=${encodeURIComponent(providerPostId)}`,
      )) as unknown[];
      return (Array.isArray(raw) ? raw : []).map((c) => fromZernioComment(c as Record<string, unknown>));
    },

    async replyToComment(commentId: string, text: string, _ctx: TenantCtx): Promise<void> {
      // FLAG: inbox reply endpoint unconfirmed.
      await request('POST', `/inbox/comments/${commentId}/reply`, { text });
    },

    async verifyWebhook(req: Request): Promise<NormalizedEvent | null> {
      if (!deps.webhookSecret) return null;
      const rawBody = await req.text();
      // FLAG: Zernio signature header name unconfirmed; mirrors Outstand's
      // `x-...-signature: sha256=<hex>` HMAC-SHA256 scheme.
      const sig = req.headers.get('x-zernio-signature');
      const ok = await verifyOutstandSignature(rawBody, sig, deps.webhookSecret);
      if (!ok) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }
      return normalizeZernioWebhook(parsed);
    },
  };
}
