// The ONE client-side reader of a `POST /posts` create-post response.
//
// WHY THIS EXISTS. Three call sites independently parsed this same response
// with three DIFFERENT unions, and one of them was simply wrong:
//
//   useCrossPost.ts          data.data.post.id ?? data.post.id ?? data.id   (correct)
//   DonnyProvider.tsx        data.data.post.id ?? data.id                   (missing the raw link)
//   useSponsorshipAmplification.ts   data.id ?? data.data.id                (never checks `.post` — ALWAYS null)
//
// The third resolved `null` on every call. Its own null-guard then skipped BOTH
// the donny_scheduled_posts insert and the social_post_log write, so amplified
// posts got no schedule row at all — which is exactly what the webhook and the
// reconcile sweep match on. Task 1 of this branch existed to give amplification
// that row; this bug made it inert. Pre-existing (it governed the
// social_post_log write long before), but the branch inherited it.
//
// That is the same defect class that produced
// supabase/functions/_shared/social-post-log-row.ts earlier on this branch: N
// hand-written copies of one rule drift, and the drift is silent. One tested
// helper, one union, every reader routed through it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ACTUAL RESPONSE SHAPE, and what settled it
//
// Raw from Outstand:            { success: true, post: { id, ... } }
// After outstand-proxy's        { success: true, post: {...}, data: { post: {...} } }
//   doc/SDK normalizer
//
// All three call sites publish through OUTSTAND_PROXY_BASE_URL (see
// src/integrations/outstand/Provider.tsx), so all three see the NORMALIZED
// shape — `data.post.id` — never a bare top-level `id`. Evidence, not a guess:
//
//  1. outstand-proxy's normalizer, live since 2026-05-07: "Outstand returns
//     top-level resource keys ({ success, post }) but the SDK reads
//     response.data.post" — it copies `parsed.post` into `parsed.data` when
//     `parsed.success && !parsed.data`. That code only exists because the raw
//     body is `{ success, post }`.
//  2. The vendored SDK types createPost as `ApiResponse<{ post: Post }>` =
//     `{ success, data?: { post } }` with `Post.id: string`.
//  3. The sibling GET /posts/{id}/analytics body — the one Outstand response
//     with a prod-VERIFIED shape in this repo
//     (supabase/functions/content-performance-capture/capture.test.ts) — is
//     flat the same way: `{ success, post: { id }, ... }`. Flat-with-`post`,
//     never flat-with-`id`.
//  4. supabase/functions/confirm-posting-schedule/index.ts:216 is a production
//     reader that has NEVER carried a bare-`id` link.
//  5. Prod `social_post_log` holds real ids (XDb8e, XDbxe, mJuDd) written via
//     the `.post`-nested readers above.
//
// Consistent with all of that: prod has ZERO amplification rows in
// social_post_log and zero `sponsorship_amplification` rows in
// donny_scheduled_posts (checked 2026-08-06) — what the broken union predicts,
// though not proof on its own, since amplification may simply never have run
// there.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT SHARED WITH THE SERVER-SIDE EXTRACTOR — DO NOT "UNIFY" THEM
//
// supabase/functions/_shared/outstand-post-ownership.ts has a near-identical
// `extractCreatedPostId`, and it DELIBERATELY OMITS the bare top-level `id`
// link this one keeps. That difference is load-bearing and security-specific:
//
//   * Server side, the extracted id becomes an OWNERSHIP BINDING
//     (outstand_post_ownership) that outstand-webhook and reconcile-social-posts
//     treat as authoritative for `social_post_log.user_id`. outstand-proxy
//     forwards the CALLER'S OWN raw JSON body verbatim to the provider, so if a
//     2xx response ever echoed a client-supplied top-level `id`, accepting that
//     link would let a caller mint a binding over ANOTHER TENANT'S unbound post
//     and be credited for it. There, an unevidenced link is an attack surface.
//   * Client side (here), the id is read from the caller's OWN publish result
//     and written to the caller's OWN rows, under RLS that pins user_id to
//     auth.uid(). Nobody else's data is reachable through it, so keeping the
//     third link costs nothing and preserves the proven reader's exact
//     behaviour.
//
// So the two legitimately differ. Collapsing them into one helper would either
// reintroduce the mint hole or drop a working client fallback. If you are here
// to "remove the duplication": don't. Both files carry this note.
//
// Deliberately dependency-free (no React/Supabase/network) so
// outstandPostId.test.ts can exercise it directly, mirroring src/lib/postType.ts.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The created post's id from a `POST /posts` response body, or `null`.
 *
 * Priority order is `data.post.id` → `post.id` → `id`, matching useCrossPost —
 * the one of the three original readers proven to work in production. The first
 * two are the shapes the evidence above establishes (post-normalization and
 * raw); the third is retained defensive behaviour, safe client-side for the
 * reason documented at the top of this file.
 *
 * Returns `null` — never a placeholder — when no usable string id is present.
 * `social_post_log.outstand_post_id` is NOT NULL and carries the UNIQUE
 * `(outstand_post_id, platform)` key, so a stand-in value would leave the row
 * permanently unmatchable by the webhook AND collide with the next unresolved
 * response on the same platform, failing the whole insert batch. Every caller
 * must treat `null` as "skip the measurement writes, visibly" — the publish
 * itself already succeeded and must stand regardless.
 */
export function extractOutstandPostId(response: unknown): string | null {
  const root = asRecord(response);
  if (!root) return null;

  const candidates = [
    asRecord(asRecord(root.data)?.post)?.id,
    asRecord(root.post)?.id,
    root.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}
