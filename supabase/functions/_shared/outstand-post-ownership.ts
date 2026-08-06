// _shared/outstand-post-ownership.ts — the SERVER-ESTABLISHED binding between
// an Outstand post id and the user who created it: how the id is read out of a
// create-post response, and the one rule every consumer applies to the binding.
//
// THREE edge functions touch this binding — outstand-proxy MINTS it (on a 2xx
// POST /posts, from ctx.userId + the provider's response id), outstand-webhook
// and reconcile-social-posts CONSUME it. Three hand-written copies of either
// rule is the same defect class _shared/social-post-log-row.ts was extracted to
// prevent: two writers quietly disagreeing about what belongs at one
// (outstand_post_id, platform) key. One definition, one place.
//
// Pure — no Deno/Supabase/IO — so outstand-post-ownership.test.ts exercises it
// directly under Vitest. That matters more here than usual: the edge functions'
// index.ts files call serve() at module load and are NOT import-testable, and a
// wrong field name in extractCreatedPostId fails SILENTLY (no binding is
// written, the strict sweep skips every post, and every run still returns 200
// with a healthy-looking summary). The tests below are the only automated thing
// standing between that failure and production.

/**
 * The created post's id, out of a POST /posts response body.
 *
 * SHAPE PROVENANCE — established from evidence, not chosen. There is no
 * captured raw Outstand create-post payload anywhere in this repo (checked:
 * docs/, docs/wiki/raw/, .superpowers/, .claude/handoffs/, every *.json, and
 * prod's donny_scheduled_posts.metadata->'outstand_response', which has zero
 * rows). What there IS:
 *
 *   1. outstand-proxy's own normalizer (index.ts, live since 2026-05-07):
 *      "Outstand returns top-level resource keys ({ success, post }) but the SDK
 *      reads response.data.post" — it wraps `parsed.post` into `parsed.data`
 *      when `parsed.success && !parsed.data`. That code only runs, and only
 *      makes sense, if the RAW upstream body is `{ success, post: {...} }`.
 *   2. The vendored SDK's own type: `createPost: (postData) =>
 *      Promise<ApiResponse<{ post: Post }>>` where `ApiResponse<T>` is
 *      `{ success, data?: T, ... }` and `Post.id` is a `string`
 *      (node_modules/@outstand-so/ui/dist/index.d.ts:41-50,197-203,331-333).
 *      So the SDK's DECLARED shape is `data.post.id` — the contradiction with
 *      (1) is precisely why the proxy's normalizer exists.
 *   3. Outstand's sibling `GET /posts/{id}/analytics` body, the one Outstand
 *      response whose shape is verified against prod in this codebase
 *      (content-performance-capture/capture.test.ts, "verified prod shape"), is
 *      flat the same way: `{ success, post: { id }, ... }`.
 *   4. Three independent production readers already apply exactly this chain:
 *      src/hooks/outstand/useCrossPost.ts:55,
 *      supabase/functions/confirm-posting-schedule/index.ts:216, and
 *      social-proxy/adapters/outstand-map.ts's fromOutstandPostResult.
 *   5. It demonstrably resolves a real id in production: social_post_log holds
 *      'XDb8e' / 'XDbxe' / 'mJuDd', written by client code whose id came off
 *      this chain through this proxy.
 *
 * So this is not a guessed field name — it is the union every existing reader
 * of this exact response already accepts, in the same priority order. Callers
 * inside outstand-proxy should pass the body AFTER the proxy's normalization,
 * where both `post` and `data.post` are present; the order below means either
 * side of the normalizer produces the same id.
 *
 * Returns null (never a placeholder) when no usable string id is present: a
 * binding row with a wrong/synthetic id is worse than no binding row, because
 * the consumers treat a present binding as authoritative.
 */
export function extractCreatedPostId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;

  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const dataPost = asObject(asObject(root.data)?.post);
  const rootPost = asObject(root.post);

  for (const candidate of [dataPost?.id, rootPost?.id, root.id]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

/**
 * The result of applying a server-established binding to the candidate
 * donny_scheduled_posts rows that matched an outstand_post_id.
 *
 * - `binding`  — a binding exists and at least one candidate agrees with it.
 *                `candidates` is exactly those agreeing rows (input order
 *                preserved, so a caller's `created_at asc` ORDER BY still
 *                holds). Every one of them carries `user_id === bindingUserId`,
 *                which is what makes the eventual social_post_log row's
 *                user_id server-established.
 * - `conflict` — a binding exists and NOT ONE candidate agrees. Nothing to
 *                build a row from that the server can vouch for. `candidates`
 *                is empty.
 * - `unbound`  — no binding at all. `candidates` is the input, untouched; it is
 *                up to each consumer whether to act on it (the webhook does,
 *                permissively; the sweep does not).
 *
 * `rejected` is the number of candidate rows discarded for disagreeing with the
 * binding. It is non-zero ONLY under `binding` or `conflict`, and it is the
 * forgery signal — see applyOwnershipBinding.
 */
export interface OwnershipBindingResult<T> {
  kind: 'binding' | 'conflict' | 'unbound';
  bindingUserId: string | null;
  candidates: T[];
  rejected: number;
}

/**
 * Apply the binding to the candidate schedule rows: keep the ones it vouches
 * for, discard and count the ones it contradicts.
 *
 * WHY REJECTION IS PER-ROW, NOT PER-POST. The rule is "the binding decides
 * user_id; the schedule row supplies the dimensions but is rejected if its
 * user_id disagrees". Rejecting the whole POST the moment ANY candidate
 * disagrees would close the leak but open a cheap denial-of-measurement:
 * outstand post ids are 5 low-entropy characters ('XDb8e', 'XDbxe', 'mJuDd' on
 * prod), a planted donny_scheduled_posts row sorts FIRST by created_at, and the
 * victim's own legitimate row would then be discarded along with the planted
 * one — so blanketing the id space with guesses would stop the platform
 * measuring almost anything. Discarding only the rows that actually disagree
 * neutralises the plant instead: the victim's own row survives, supplies the
 * dimensions, and the post is measured correctly. `rejected` still surfaces
 * that the attempt happened, which matters — a neutralised attack that
 * incremented no counter would be completely invisible.
 *
 * WHY THIS RETURNS ROWS RATHER THAN OVERRIDING user_id. Because every surviving
 * candidate satisfies `user_id === bindingUserId`, a caller can keep passing
 * one straight to buildSocialPostLogRow (which reads `sched.user_id`) and the
 * resulting row's user_id is still the binding's, by construction. That is
 * deliberate: buildSocialPostLogRow is the single shared source of truth for
 * what belongs at an (outstand_post_id, platform) key, it is pure and has no
 * IO, and threading an owner-override parameter through it would have added a
 * second, silently-defaultable way to set the one field this whole task exists
 * to make trustworthy. Filtering is the enforcement; the builder needs no new
 * authority and stays pure.
 *
 * A blank/absent binding id is `unbound`, never a match: an empty string must
 * not be able to agree with anything. A candidate row with a non-string /
 * missing user_id can never agree either — it is rejected under a binding, and
 * left alone (for the caller's own handling) when unbound.
 */
export function applyOwnershipBinding<T extends { user_id?: unknown }>(
  bindingUserId: string | null | undefined,
  rows: T[],
): OwnershipBindingResult<T> {
  if (typeof bindingUserId !== 'string' || bindingUserId.length === 0) {
    return { kind: 'unbound', bindingUserId: null, candidates: rows, rejected: 0 };
  }
  const candidates = rows.filter(
    (r) => typeof r?.user_id === 'string' && r.user_id === bindingUserId,
  );
  const rejected = rows.length - candidates.length;
  return {
    kind: candidates.length > 0 ? 'binding' : 'conflict',
    bindingUserId,
    candidates,
    rejected,
  };
}
