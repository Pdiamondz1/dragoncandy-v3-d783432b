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

// Outstand stores the filename verbatim and platforms (Facebook, Instagram,
// etc.) fetch the media URL via Graph APIs. Spaces, parentheses, and other
// unsafe characters in the URL break Graph's URL parser and produce
// "Missing or invalid image file" errors. Coerce to [a-zA-Z0-9._-] before
// the upload starts so the stored URL is always safe.
function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf('.');
  let base = name;
  let ext = '';
  if (lastDot > 0 && lastDot < name.length - 1) {
    base = name.slice(0, lastDot);
    ext = name.slice(lastDot);
  }
  base = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  ext = ext.replace(/[^a-zA-Z0-9.]/g, '');
  if (!base) base = 'file';
  return `${base}${ext}`;
}

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
      // Sanitize the filename before upload — Outstand stores it verbatim in the
      // media URL and unsafe chars break Facebook/Instagram Graph publishing.
      // `content_type`, SNAKE_CASE — the WIRE field, read off the SDK bundle
      // (`api.post("/media/upload", { filename, content_type: contentType })`).
      // The camelCase spelling is only the name of the SDK's argument, and
      // sending it means Outstand receives NO MIME type at all. Pre-existing
      // here; the identical mistake was made and fixed in outstand-proxy's
      // upload allow-list, which is what surfaced this one.
      const body = {
        filename: sanitizeFilename(file.filename),
        content_type: file.contentType,
        size: file.size,
      };
      const raw = (await request('POST', '/media/upload', body)) as Record<string, unknown>;
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

    async replyToComment(
      params: { commentId: string; text: string; postId?: string },
      _ctx: TenantCtx,
    ): Promise<void> {
      // Outstand's reply endpoint is post-scoped: POST /posts/{postId}/comments.
      // The gateway requires providerPostId for this op (ownership), so postId is
      // present; commentId is not part of the Outstand reply path.
      if (!params.postId) {
        throw new Error('Outstand replyToComment requires a postId');
      }
      await request('POST', `/posts/${params.postId}/comments`, { text: params.text });
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
