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
  // The OAuth connect flow does NOT live on api.zernio.com — it is served from
  // zernio.com/api/v1 (verified live 2026-08-04; the docs' multi-tenant guide
  // uses the same host). Kept as its own dep so the two can drift independently.
  connectBaseUrl?: string;
  accountPlatforms: Record<string, Platform>; // accountId → platform, supplied by the gateway
  webhookSecret?: string;
  fetchImpl?: typeof fetch; // injectable for tests; default globalThis.fetch
}

export const ZERNIO_CONNECT_BASE_URL = 'https://zernio.com/api/v1';

export function createZernioAdapter(deps: ZernioAdapterDeps): SocialProvider {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const base = deps.baseUrl.replace(/\/$/, '');
  const connectBase = (deps.connectBaseUrl ?? ZERNIO_CONNECT_BASE_URL).replace(/\/$/, '');

  /** Build URL + fetch with bearer; throw on non-2xx; return parsed JSON. */
  async function request(
    method: string,
    path: string,
    body?: unknown,
    origin: string = base,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${deps.apiKey}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${origin}${path}`, {
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
    async ensureTenantProfile(name: string, _ctx: TenantCtx): Promise<string | null> {
      // Idempotent by NAME, so the gateway re-derives the same profile on both
      // legs of the OAuth round-trip without persisting anything between them
      // (there is no account row yet at getConnectUrl time) and without trusting
      // a client-supplied id.
      //
      // `?name=` is an EXACT-MATCH server-side filter (Zernio OpenAPI, verified
      // 2026-08-04) — documented as the way to recover an id after an ambiguous
      // create. Filtering server-side matters: an unfiltered GET /profiles
      // returns every profile in one unbounded array with no pagination cursor,
      // which at thousands of tenants is a payload we must never request.
      const raw = await request('GET', `/profiles?name=${encodeURIComponent(name)}`);
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.profiles)
        ? ((raw as Record<string, unknown>).profiles as unknown[])
        : [];
      // Re-assert the match locally rather than trusting the filter blindly.
      const found = (list as Array<Record<string, unknown>>).find((p) => p?.name === name);
      if (found) return String(found._id ?? found.id ?? '') || null;

      // Create. Names are unique per workspace, so a concurrent first-connect
      // loses with 409 + `details.existingProfileId` — which is the winner's id,
      // so both callers still converge on one profile. Idempotency-Key makes a
      // retried create replay the original 201 rather than conflict.
      const res = await fetchImpl(`${base}/profiles`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `profile:${name}`,
        },
        body: JSON.stringify({ name, description: 'DragonCandy tenant' }),
      });
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 409) {
        const details = (parsed?.details ?? {}) as Record<string, unknown>;
        const existing = String(details.existingProfileId ?? '');
        if (existing) return existing;
        throw new Error(`Zernio profile name conflict with no existingProfileId: ${name}`);
      }
      if (!res.ok) {
        throw new Error(`Zernio POST /profiles failed: ${res.status}`);
      }
      const profile = ((parsed?.profile ?? parsed) ?? {}) as Record<string, unknown>;
      return String(profile._id ?? profile.id ?? '') || null;
    },

    async getConnectUrl(platform: Platform, redirectUri: string, ctx: TenantCtx) {
      // VERIFIED 2026-08-04 (live round-trip + docs /guides/multi-tenant):
      //   GET https://zernio.com/api/v1/connect/{platform}?profileId=…&redirect_url=…
      //   → { authUrl, state }
      // Two things the previous guess got wrong: the param is `redirect_url`
      // (snake_case), NOT `redirectUri` — an ignored param would have silently
      // returned the DASHBOARD's own return URL, stranding the user on Zernio
      // instead of our callback — and the connect flow is served from
      // zernio.com/api/v1, not the api.zernio.com host used everywhere else.
      const zPlatform = PLATFORM_TO_ZERNIO[platform];
      const params = new URLSearchParams({ redirect_url: redirectUri });
      if (ctx.providerProfileId) params.set('profileId', ctx.providerProfileId);
      const raw = (await request(
        'GET',
        `/connect/${zPlatform}?${params.toString()}`,
        undefined,
        connectBase,
      )) as Record<string, unknown>;
      const url = (raw?.authUrl ?? raw?.url ?? raw?.connectUrl) as string | undefined;
      return { url: url ?? '' };
    },

    finalizeConnection(_params: unknown, _ctx: TenantCtx): Promise<SocialAccount[]> {
      // FLAG: Zernio OAuth finalize shape unconfirmed; Phase 2 wires the real
      // callback. For now the connect flow returns accounts via listAccounts.
      return Promise.resolve([]);
    },

    async listAccounts(ctx: TenantCtx): Promise<SocialAccount[]> {
      // VERIFIED 2026-08-04: the body is an OBJECT — {"accounts":[...],
      // "hasAnalyticsAccess":true} — not a bare array. The previous
      // `Array.isArray(raw) ? raw : []` therefore returned [] unconditionally,
      // which would have surfaced as "no accounts connected" rather than as a
      // parse bug. Tolerate a bare array too in case the shape ever changes.
      //
      // `?profileId=` IS honored here (unlike `?accountId=` on /analytics, which
      // is silently ignored) — verified by an isolation probe. The gateway still
      // re-filters against our own DB, so this is defence in depth, not the gate.
      const q = ctx.providerProfileId
        ? `?profileId=${encodeURIComponent(ctx.providerProfileId)}`
        : '';
      const raw = await request('GET', `/accounts${q}`);
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.accounts)
        ? ((raw as Record<string, unknown>).accounts as unknown[])
        : [];
      return list.map((a) => fromZernioAccount(a as never));
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
      // VERIFIED 2026-08-04: `?accountId=` is IGNORED by Zernio — the filtered
      // and unfiltered bodies are byte-identical. The account slice must be
      // selected client-side, which is why accountId is passed to the mapper.
      // (`?postId=` IS honored and returns a different, post-scoped shape.)
      // There is no `accountStats` key and no account-level reach/engagement
      // rollup; the mapper aggregates posts[].platforms[] by accountId.
      const raw = await request('GET', '/analytics');
      return fromZernioAccountAnalytics(raw, accountId);
    },

    async listComments(providerPostId: string, _ctx: TenantCtx): Promise<Comment[]> {
      // FLAG: inbox/comments endpoint unconfirmed.
      const raw = (await request(
        'GET',
        `/inbox/comments?postId=${encodeURIComponent(providerPostId)}`,
      )) as unknown[];
      return (Array.isArray(raw) ? raw : []).map((c) => fromZernioComment(c as Record<string, unknown>));
    },

    async replyToComment(
      params: { commentId: string; text: string; postId?: string },
      _ctx: TenantCtx,
    ): Promise<void> {
      // FLAG: inbox reply endpoint unconfirmed. Zernio's reply is comment-scoped
      // (postId not needed).
      await request('POST', `/inbox/comments/${params.commentId}/reply`, {
        text: params.text,
      });
    },

    async verifyWebhook(req: Request): Promise<NormalizedEvent | null> {
      if (!deps.webhookSecret) return null;
      const rawBody = await req.text();
      // VERIFIED 2026-08-04 (Zernio docs "Signature verification"): header
      // `X-Zernio-Signature`, value = lowercase hex HMAC-SHA256 over the RAW
      // request body, no timestamp and no `sha256=` prefix. That is a subset of
      // the shared Outstand verifier, whose prefix strip is a no-op on bare hex
      // — hence the reuse rather than a near-duplicate implementation.
      // `x-late-signature` is Zernio's own legacy alias (it was formerly Late).
      const sig = req.headers.get('x-zernio-signature') ?? req.headers.get('x-late-signature');
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
