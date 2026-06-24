// Thin Outstand IO adapter — implements the SocialProvider contract over fetch +
// the pure outstand-map mappers. Behavior-preserving: every path mirrors the
// existing outstand-proxy/index.ts SDK routes (POST /social-networks/{n}/auth-url,
// GET/DELETE /social-accounts/{id}, /posts, /posts/{id}/analytics,
// /social-accounts/{id}/metrics, /media/upload, …). NO business logic, NO DB,
// NO Deno.env reads — config is injected by the gateway factory (Task 7).

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
  fromOutstandAccount,
  fromOutstandAccountAnalytics,
  fromOutstandComment,
  fromOutstandPost,
  fromOutstandPostAnalytics,
  fromOutstandPostResult,
  normalizeOutstandWebhook,
  toOutstandCreatePost,
} from './outstand-map.ts';

export interface OutstandAdapterDeps {
  apiKey: string;
  baseUrl: string; // defaults via the gateway to https://api.outstand.so/v1
  webhookSecret?: string;
  fetchImpl?: typeof fetch; // injectable for tests; default globalThis.fetch
}

export function createOutstandAdapter(deps: OutstandAdapterDeps): SocialProvider {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const base = deps.baseUrl.replace(/\/$/, '');

  /** Build URL + fetch with bearer; throw on non-2xx; return parsed JSON. */
  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${deps.apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Outstand ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return await res.json();
  }

  return {
    async getConnectUrl(platform: Platform, redirectUri: string, _ctx: TenantCtx) {
      const raw = (await request('POST', `/social-networks/${platform}/auth-url`, {
        redirectUri,
      })) as Record<string, unknown>;
      const data = (raw?.data ?? raw) as Record<string, unknown>;
      const url = (data?.auth_url ?? data?.authUrl ?? data?.url) as string | undefined;
      return { url: url ?? '' };
    },

    finalizeConnection(_params: unknown, _ctx: TenantCtx): Promise<SocialAccount[]> {
      // Outstand finalize is handled by the gateway (it records the
      // business_outstand_accounts mapping). The adapter exposes no extra call.
      return Promise.resolve([]);
    },

    async listAccounts(_ctx: TenantCtx): Promise<SocialAccount[]> {
      const raw = (await request('GET', '/social-accounts')) as Record<string, unknown>;
      const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return (rows as unknown[]).map((a) => fromOutstandAccount(a as never));
    },

    async disconnect(accountId: string, _ctx: TenantCtx): Promise<void> {
      await request('DELETE', `/social-accounts/${accountId}`);
    },

    async uploadMedia(file: MediaUploadInput, _ctx: TenantCtx): Promise<{ id: string; url: string }> {
      const raw = (await request('POST', '/media/upload', file)) as Record<string, unknown>;
      const data = (raw?.data ?? raw) as Record<string, unknown>;
      return { id: String(data?.id ?? ''), url: String(data?.url ?? '') };
    },

    async createPost(input: PostInput, _ctx: TenantCtx): Promise<PostResult> {
      const body = toOutstandCreatePost(input);
      return fromOutstandPostResult(await request('POST', '/posts', body));
    },

    async getPost(providerPostId: string, _ctx: TenantCtx): Promise<ProviderPost> {
      const raw = (await request('GET', `/posts/${providerPostId}`)) as Record<string, unknown>;
      const post = (raw?.data as Record<string, unknown>)?.post ?? raw?.post ?? raw?.data ?? raw;
      return fromOutstandPost(post);
    },

    async deletePost(providerPostId: string, _ctx: TenantCtx): Promise<void> {
      await request('DELETE', `/posts/${providerPostId}`);
    },

    async getPostAnalytics(providerPostId: string, _ctx: TenantCtx): Promise<PostAnalytics> {
      return fromOutstandPostAnalytics(await request('GET', `/posts/${providerPostId}/analytics`));
    },

    async getAccountAnalytics(accountId: string, _ctx: TenantCtx): Promise<AccountAnalytics> {
      return fromOutstandAccountAnalytics(
        await request('GET', `/social-accounts/${accountId}/metrics`),
      );
    },

    async listComments(providerPostId: string, _ctx: TenantCtx): Promise<Comment[]> {
      const raw = (await request('GET', `/posts/${providerPostId}/comments`)) as Record<string, unknown>;
      const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return (rows as unknown[]).map((c) => fromOutstandComment(c as Record<string, unknown>));
    },

    async replyToComment(commentId: string, text: string, _ctx: TenantCtx): Promise<void> {
      // FLAG: impedance mismatch. Outstand comments are per-POST
      // (POST /posts/{postId}/comments) but the contract signature only carries
      // commentId. Best-effort treats commentId as the postId; the real reply
      // path needs a postId and is reconciled in Phase 3.
      await request('POST', `/posts/${commentId}/comments`, { text });
    },

    async verifyWebhook(req: Request): Promise<NormalizedEvent | null> {
      if (!deps.webhookSecret) return null;
      const rawBody = await req.text();
      const sig = req.headers.get('x-outstand-signature');
      const ok = await verifyOutstandSignature(rawBody, sig, deps.webhookSecret);
      if (!ok) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }
      return normalizeOutstandWebhook(parsed);
    },
  };
}
