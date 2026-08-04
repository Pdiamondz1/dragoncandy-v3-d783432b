// Pure, runtime-agnostic Zernio webhook normalization. No Deno/Node/Supabase/IO
// so the logic stays unit-testable — the sibling of _shared/outstand-webhook-lib.ts.
//
// This lives in _shared/ rather than beside the other Zernio mappers because TWO
// functions consume it: the zernio-webhook receiver and social-proxy's adapter.
// Each function's deploy bundle is a point-in-time snapshot, not a live shared
// module, so a cross-function import would let an edit made during a
// social-proxy-only deploy silently desync the webhook receiver's frozen copy.

import type { NormalizedEvent, NormalizedEventType } from './social-contract.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// Verified against Zernio's OpenAPI spec 2026-08-04. Note `post.failed` (NOT
// `post.error`) and `account.disconnected` (NOT `account.token_expired`) are the
// real wire names; the right-hand side is OUR normalized vocabulary.
//
// `post.partial` maps to an error deliberately: some platform targets published
// and some did not, and the contract has no "partially published" state. The
// per-platform truth is preserved in `perAccount`, which the webhook handler
// writes to metadata.publish_result, so nothing is lost — only flattened.
const EVENT_MAP: Record<string, NormalizedEventType> = {
  'post.published': 'post.published',
  'post.failed': 'post.error',
  'post.partial': 'post.error',
  'account.disconnected': 'account.token_expired',
  'account.token_expired': 'account.token_expired',
};

/**
 * Zernio webhook body → NormalizedEvent, or null for events we don't surface
 * (post.scheduled, post.cancelled, account.connected, comment.received,
 * webhook.test, …).
 *
 * VERIFIED SHAPE (OpenAPI, 2026-08-04) — the payload is FLAT, not wrapped:
 *   post:    { id, event, post:    { id, publishedAt, platforms: [...] },        timestamp }
 *   account: { id, event, account: { accountId, profileId, disconnectionType, … }, timestamp }
 *
 * The first implementation read everything out of `body.data`, which does not
 * exist in a real Zernio payload — so `providerPostId` came back null for every
 * event, the handler rejected it as "Missing postId", and every scheduled post
 * would have stayed `scheduled` forever with no error anywhere. The `data.*`
 * reads are kept below purely as fallbacks.
 *
 * Also note the post id field is `id`, not the `_id` used by the REST resources.
 */
export function normalizeZernioWebhook(body: unknown): NormalizedEvent | null {
  if (!isObject(body)) return null;

  const eventName = str(body.event) ?? str(body.type);
  if (!eventName) return null;

  let type = EVENT_MAP[eventName];
  if (!type) return null;

  const data = isObject(body.data) ? body.data : {};
  const post = isObject(body.post) ? body.post : isObject(data.post) ? data.post : {};
  const account = isObject(body.account) ? body.account : isObject(data.account) ? data.account : {};

  // An intentional disconnect is the user deliberately unlinking, not a dead
  // token — surfacing it as "reconnect needed" would nag someone who meant to
  // leave. Only `unintentional` (expired/revoked token) warrants a reconnect.
  if (type === 'account.token_expired' && str(account.disconnectionType) === 'intentional') {
    type = 'account.revoked';
  }

  const providerPostId =
    str(post.id) ?? str(post._id) ?? str(data.postId) ?? str(data.post_id) ?? null;
  const accountId =
    str(account.accountId) ?? str(account.id) ?? str(data.accountId) ?? str(data.account_id) ?? null;
  const publishedAt =
    str(post.publishedAt) ?? str(data.publishedAt) ?? str(data.published_at) ?? null;

  return {
    type,
    providerPostId,
    accountId,
    publishedAt,
    // Per-platform results for post events; the account object otherwise.
    perAccount: Array.isArray(post.platforms) ? post.platforms : (body.account ?? data),
  };
}
