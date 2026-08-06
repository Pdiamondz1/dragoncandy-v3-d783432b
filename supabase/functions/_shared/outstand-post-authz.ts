// _shared/outstand-post-authz.ts — may this caller act on this ONE Outstand post?
//
// WHY THIS IS A SEPARATE, PURE MODULE. outstand-proxy/index.ts calls serve() at
// module load, so it is NOT import-testable under Vitest (the same constraint
// that produced _shared/outstand-post-ownership.ts and
// release-creator-payout/wallet-first.ts). The rule below decides whether a
// request reaches a post through an ORG-WIDE provider key — every tenant's posts
// live behind that one key — so "we couldn't test it" is not an acceptable
// property for it to have. Everything here is pure: no Deno, no Supabase, no IO.
// The caller gathers the facts; this file weighs them.
//
// THE DEFECT THIS REPLACES (both halves of it). The previous rule set
// `allowed = true` from two things that are not ownership:
//
//   (A) REQUEST-BODY ACCOUNT IDS AS A GRANT. For PATCH/PUT/DELETE it parsed
//       `social_account_ids`/`accounts` out of the CALLER-SUPPLIED body and
//       allowed if `.some()` of them was owned. The post id in the path was
//       never checked against those accounts. So `DELETE /posts/{any_post_id}`
//       with a body naming your own account id deleted ANY post in the org.
//       The body says what the caller WANTS to touch; it is not evidence of what
//       they own.
//
//   (B) A PLATFORM-LEVEL FALLBACK. If the post's accounts didn't match, it fell
//       back to allowing when the post's PLATFORM was one the caller owned any
//       account on. Owning one Instagram account therefore authorized every
//       Instagram post in the org. Platform is a property of a post, not a
//       relationship to a user.
//
// These were coupled: fixing (A) alone left the destructive path fully open
// through (B), because (B) grants on its own. Both are gone.
//
// WHAT REMAINS — grants rest ONLY on a server-established fact. There are
// exactly two, and both are things a client cannot assert:
//
//   1. `postAccountIds` — the accounts the PROVIDER says this post belongs to,
//      fetched server-side by the proxy with the org key against
//      GET /posts/{id}, intersected with the caller's own connected accounts.
//   2. `bindingUserId` — outstand_post_ownership, minted by the proxy on a 2xx
//      POST /posts from auth.getUser()'s user id plus the provider's own
//      response id (see 20260806184500_outstand_post_ownership.sql). No client
//      write path exists.
//
// Nothing else may set allowed. If both come back empty, the answer is no.

/**
 * The social-account ids a REQUEST BODY names.
 *
 * ONE READER, TWO CALL SITES — deliberately. outstand-proxy applies this to
 * `POST /posts` (where naming an unowned account must be refused up front) and
 * to a mutating `/posts/{id}` (where it is the re-targeting constraint below).
 * Those used to be two hand-written extractions reading DIFFERENT field sets:
 * the create path read five fields, the mutate path read two. A field the
 * constraint fails to read is a field an attacker can re-target through
 * silently, so the narrower copy was a hole in the wider one's clothing. This is
 * the same "two writers quietly disagreeing about one key" defect class
 * _shared/social-post-log-row.ts and _shared/outstand-post-ownership.ts were
 * extracted to prevent.
 *
 * Field set is the union of what the two call sites already read in production,
 * not a guess: the array forms `accounts` / `social_account_ids` /
 * `socialAccountIds` and the scalar forms `social_account_id` /
 * `socialAccountId`.
 *
 * Values are coerced with String() rather than being unwrapped from objects.
 * That is the established production reading (the create path has shipped this
 * way since 2026-05-07) and it FAILS CLOSED: an element this doesn't understand
 * stringifies to something like "[object Object]", which is not in anyone's
 * owned set, so the request is denied rather than waved through. Widening it to
 * dig ids out of objects would be a widening of what gets ALLOWED, and nothing
 * in the SDK's traffic calls for it.
 *
 * Deduplicated, order preserved. Non-object bodies yield [].
 */
export function extractRequestAccountIds(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const root = body as Record<string, unknown>;

  const ids: string[] = [];
  for (const field of ['accounts', 'social_account_ids', 'socialAccountIds']) {
    const val = root[field];
    if (Array.isArray(val)) {
      for (const entry of val) ids.push(String(entry));
    }
  }
  for (const field of ['social_account_id', 'socialAccountId']) {
    const val = root[field];
    if (val !== undefined && val !== null && val !== '') ids.push(String(val));
  }
  return [...new Set(ids)];
}

/**
 * The first requested account id the caller does NOT own, or null if it owns
 * every one (including the vacuous case of requesting none).
 *
 * Returns the offending ID, not a boolean, so the caller can name it in both the
 * 403 body and the log line — a denial nobody can attribute to a specific
 * account is a denial nobody can debug.
 *
 * `.every()`, NOT `.some()`. The replaced code used `.some()` even for the
 * grant, which meant naming ONE owned account alongside any number of unowned
 * ones passed. As a constraint that is just as wrong: the point is that a
 * mutating request may not re-target a post onto an account the caller does not
 * control, and "at least one of these is mine" does not establish that.
 */
export function firstUnownedAccountId(
  requestedAccountIds: readonly string[],
  ownedAccountIds: ReadonlySet<string>,
): string | null {
  for (const id of requestedAccountIds) {
    if (!ownedAccountIds.has(id)) return id;
  }
  return null;
}

export interface PostAccessInput {
  /** The caller's own connected accounts, from business_outstand_accounts. */
  ownedAccountIds: ReadonlySet<string>;
  /**
   * Account ids named by a MUTATING request body ([] for reads, or when the
   * body names none). A CONSTRAINT on the request, never a grant.
   */
  requestedAccountIds: readonly string[];
  /**
   * The accounts the PROVIDER says this post belongs to, fetched server-side
   * with the org key. Empty when the post has none, when the provider fetch
   * failed, or when the response shape moved — all of which must fail closed.
   */
  postAccountIds: readonly string[];
  /**
   * outstand_post_ownership.user_id for this post id, or null when there is no
   * binding OR the read failed. An unreadable binding is not a grant.
   */
  bindingUserId: string | null;
  /** From auth.getUser() on the caller's own JWT. Never client-supplied. */
  callerUserId: string;
}

export type PostAccessDecision =
  | { allowed: true; grant: 'post_account' | 'ownership_binding' }
  | { allowed: false; reason: 'unowned_target_account'; accountId: string }
  | { allowed: false; reason: 'no_ownership_evidence' };

/**
 * The whole rule, in one place.
 *
 * ORDER IS LOAD-BEARING. The constraint runs FIRST and cannot be overridden by
 * either grant: owning a post does not entitle you to re-point it at somebody
 * else's connected account. So a caller who legitimately owns post P (by binding
 * or by account) is still refused a PATCH that names an account they don't own.
 *
 * TOTAL AND SELF-SUFFICIENT. It needs no facts beyond its input and enforces
 * every clause itself. outstand-proxy additionally short-circuits the constraint
 * before it spends a provider round trip, but that is purely an IO saving — it
 * can only reach the same verdict this function would, which is why the
 * optimization cannot drift into a policy difference.
 *
 * FAIL CLOSED BY CONSTRUCTION, not by remembering to. Both grants require
 * POSITIVE evidence: a non-empty intersection, or a non-empty binding equal to
 * the caller. Every "we don't know" — provider fetch failed, binding table
 * unreadable, response shape moved, post genuinely has no accounts — arrives
 * here as an empty array or a null and lands on `no_ownership_evidence`. There
 * is no branch where absence of information produces an allow.
 */
export function decidePostAccess(input: PostAccessInput): PostAccessDecision {
  const unowned = firstUnownedAccountId(input.requestedAccountIds, input.ownedAccountIds);
  if (unowned !== null) {
    return { allowed: false, reason: 'unowned_target_account', accountId: unowned };
  }

  if (input.postAccountIds.some((id) => input.ownedAccountIds.has(id))) {
    return { allowed: true, grant: 'post_account' };
  }

  // Both sides must be non-empty strings AND equal. The length guard is not
  // decoration: without it a null/absent caller id could match a null/absent
  // binding and grant on two pieces of missing information.
  if (
    typeof input.bindingUserId === 'string' &&
    input.bindingUserId.length > 0 &&
    input.bindingUserId === input.callerUserId
  ) {
    return { allowed: true, grant: 'ownership_binding' };
  }

  return { allowed: false, reason: 'no_ownership_evidence' };
}
