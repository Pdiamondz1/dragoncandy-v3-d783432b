// _shared/outstand-list-filter.ts — strip other tenants' rows out of an
// Outstand LIST response before it reaches the caller.
//
// WHY THIS IS A SEPARATE, PURE MODULE. outstand-proxy/index.ts calls serve() at
// module load and is not import-testable under Vitest — the same constraint
// that produced _shared/outstand-post-authz.ts and
// release-creator-payout/wallet-first.ts. This code is the ONLY thing standing
// between a caller and the whole org's post list: enforceScope allows
// GET /posts and GET /social-accounts UNCONDITIONALLY, with no per-row check
// anywhere upstream, on the promise that this function removes everyone else's
// rows. The Outstand API key is org-wide, so a row this fails to drop is
// another tenant's row. "We couldn't test it" is not an acceptable property for
// that to have.
//
// THE DEFECT THIS REPLACES — observed, not theorised. Captured through this
// proxy on prod 2026-08-06 as a user owning exactly one social account, the
// GET /posts envelope is:
//
//   { success: true, posts: [5 posts], data: [1 post], pagination: {...} }
//
// BOTH `posts` and `data` hold post objects. The previous implementation
// filtered the single key `data` — which went 5 -> 1 correctly — and forwarded
// `posts` UNTOUCHED, carrying 4 posts belonging to a different tenant's
// connected account (captions, media, live Instagram permalinks) to any
// authenticated caller. No id to guess, nothing to forge, one request.
// `pagination.total` additionally reported 49, the org-wide post count. The
// filter appeared to work while the full list rode along beside it, and the
// vendor SDK's own usePosts() reads `.posts` — precisely the key that leaked.
//
// (GET /social-accounts was NOT affected — observed as a single `data` array,
// correctly filtered. It is covered by the same general rule below rather than
// by trusting that observation to keep holding.)
//
// THE RULE NOW: filter EVERY array of rows in the response, not an allow-list
// of key names someone must remember to extend. A key-based list is exactly
// what failed: it silently forwards any array the provider adds or renames, and
// the failure is invisible because the response still looks filtered.

/**
 * Every social-account id reachable from a post-shaped object.
 *
 * Moved here verbatim from outstand-proxy/index.ts so the row test and the
 * ownership fetch share ONE reading of "which accounts is this post on". Two
 * copies drifting apart is the defect class _shared/social-post-log-row.ts and
 * _shared/outstand-post-authz.ts were both extracted to prevent.
 */
export function extractSocialAccountIds(post: any): string[] {
  if (!post) return [];
  const ids: string[] = [];
  const arrayFields = ['socialAccounts', 'social_accounts', 'connectedAccounts', 'accounts'];
  for (const field of arrayFields) {
    if (Array.isArray(post[field])) {
      for (const sa of post[field]) {
        if (sa?.id) ids.push(String(sa.id));
        if (sa?.social_account_id) ids.push(String(sa.social_account_id));
        if (sa?.socialAccountId) ids.push(String(sa.socialAccountId));
      }
    }
  }
  if (post.social_account_id) ids.push(String(post.social_account_id));
  if (post.socialAccountId) ids.push(String(post.socialAccountId));
  if (post.account_id) ids.push(String(post.account_id));
  return [...new Set(ids)];
}

/** Does this account row name an id the caller owns? */
export function isOwnedAccountRow(item: any, ownedIds: ReadonlySet<string>): boolean {
  const id = item?.id ?? item?.social_account_id ?? item?.socialAccountId;
  return id !== undefined && ownedIds.has(String(id));
}

/**
 * Does this post row sit on at least one account the caller owns?
 *
 * A post with no resolvable account ids is DROPPED, not kept. We cannot show it
 * belongs to this caller, and an unattributable row is exactly the thing that
 * must not travel out through an org-wide key.
 */
export function isOwnedPostRow(item: any, ownedIds: ReadonlySet<string>): boolean {
  return extractSocialAccountIds(item).some((id) => ownedIds.has(id));
}

export interface ListFilterResult {
  /** The filtered body, re-serialised. Unchanged input is returned verbatim. */
  body: string;
  /** Rows kept across every array touched. */
  kept: number;
  /** Rows removed across every array touched. */
  dropped: number;
}

/**
 * Filter an Outstand list response down to the caller's own rows.
 *
 * `path` selects the row test; anything other than a known list endpoint is
 * returned untouched, because enforceScope has already decided that request on
 * its own terms and this function must not silently mangle a non-list body.
 *
 * Non-JSON, non-object, and empty bodies pass through unchanged — there are no
 * rows in them to leak.
 */
export function filterListRows(
  path: string,
  bodyText: string,
  ownedIds: ReadonlySet<string>,
): ListFilterResult {
  const unchanged = (): ListFilterResult => ({ body: bodyText, kept: 0, dropped: 0 });
  if (!bodyText) return unchanged();

  const rowTest = path === '/social-accounts'
    ? (item: any) => isOwnedAccountRow(item, ownedIds)
    : path === '/posts'
      ? (item: any) => isOwnedPostRow(item, ownedIds)
      : null;
  if (!rowTest) return unchanged();

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return unchanged();
  }
  if (!parsed || typeof parsed !== 'object') return unchanged();

  // An array of primitives (ids, error strings) carries no rows and is left
  // alone; an array holding at least one object is treated as a row list.
  const isRowList = (v: unknown): boolean =>
    Array.isArray(v) && v.some((e) => e !== null && typeof e === 'object');

  let kept = 0;
  let dropped = 0;

  if (Array.isArray(parsed)) {
    const before = parsed.length;
    parsed = parsed.filter(rowTest);
    kept = parsed.length;
    dropped = before - kept;
  } else {
    for (const key of Object.keys(parsed)) {
      if (!isRowList(parsed[key])) continue;
      const before = parsed[key].length;
      parsed[key] = parsed[key].filter(rowTest);
      kept += parsed[key].length;
      dropped += before - parsed[key].length;
    }

    // Counters must not survive filtering — `pagination.total` of 49 told the
    // caller how many posts the whole ORG has. Rewritten to what we actually
    // return, at the top level and inside `pagination` alike.
    //
    // NOTE, and it is deliberately NOT fixed here: paging over a post-hoc
    // filtered list is incoherent regardless (upstream page N is not the
    // caller's page N). This stops the disclosure; it does not make offset
    // paging correct.
    for (const container of [parsed, parsed.pagination]) {
      if (!container || typeof container !== 'object') continue;
      for (const k of ['count', 'total']) {
        if (typeof container[k] === 'number') container[k] = kept;
      }
    }
  }

  return { body: JSON.stringify(parsed), kept, dropped };
}
