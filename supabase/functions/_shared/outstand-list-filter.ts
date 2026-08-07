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

  // Rows kept, counted by row IDENTITY not by occurrence. The observed envelope
  // carries the SAME post in both `posts` and `data`, so summing array lengths
  // reported a caller's 1 post as 2. Object identity is no help — JSON.parse
  // materialises the two occurrences as separate objects — so identity is the
  // row's own `id`, falling back to the object reference for rows without one
  // (which then count once each, the honest answer when we cannot tell them
  // apart).
  const keptRows = new Set<unknown>();
  const rowIdentity = (row: any): unknown =>
    row && typeof row === 'object' && (typeof row.id === 'string' || typeof row.id === 'number')
      ? `id:${row.id}`
      : row;
  let dropped = 0;

  // Walk the whole envelope, not just its top level. The previous version
  // filtered depth 1 only, which is the same shape of mistake as filtering one
  // key name: a row array one level down (`{data:{posts:[...]}}`) would be
  // forwarded whole. Depth is bounded so a pathological or cyclic body cannot
  // spin here; `seen` also makes a cycle terminate rather than overflow.
  const MAX_DEPTH = 6;
  const seen = new WeakSet<object>();
  const walk = (node: any, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
    if (seen.has(node)) return;
    seen.add(node);

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (isRowList(value)) {
        const before = value.length;
        const filtered = value.filter(rowTest);
        node[key] = filtered;
        for (const row of filtered) keptRows.add(rowIdentity(row));
        dropped += before - filtered.length;
        // Do NOT descend into kept rows: a post legitimately contains nested
        // objects (containers, media, its own socialAccounts) that are not
        // themselves tenant rows, and filtering those would gut the payload.
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, depth + 1);
      }
    }
  };

  if (Array.isArray(parsed)) {
    const before = parsed.length;
    parsed = parsed.filter(rowTest);
    for (const row of parsed) keptRows.add(rowIdentity(row));
    dropped = before - parsed.length;
  } else {
    walk(parsed, 0);
  }

  const kept = keptRows.size;

  // Counters must not survive filtering — `pagination.total` of 49 told the
  // caller how many posts the whole ORG has. Every numeric counter is rewritten
  // to what we actually return, wherever it sits: `total` was only one spelling,
  // and `totalPages`/`total_count`/`pages` describe the same org-wide set.
  //
  // NOTE, and it is deliberately NOT fixed here: paging over a post-hoc
  // filtered list is incoherent regardless (upstream page N is not the caller's
  // page N). This stops the disclosure; it does not make offset paging correct.
  const ROW_COUNTER = /^(count|total|totalCount|total_count)$/;
  const PAGE_COUNTER = /^(totalPages|total_pages|pages)$/;
  if (!Array.isArray(parsed)) {
    const counterSeen = new WeakSet<object>();
    const fixCounters = (node: any, depth: number): void => {
      if (!node || typeof node !== 'object' || Array.isArray(node) || depth > MAX_DEPTH) return;
      if (counterSeen.has(node)) return;
      counterSeen.add(node);
      for (const key of Object.keys(node)) {
        if (typeof node[key] === 'number' && ROW_COUNTER.test(key)) {
          node[key] = kept;
        } else if (typeof node[key] === 'number' && PAGE_COUNTER.test(key)) {
          node[key] = kept > 0 ? 1 : 0;
        } else {
          fixCounters(node[key], depth + 1);
        }
      }
    };
    fixCounters(parsed, 0);
  }

  return { body: JSON.stringify(parsed), kept, dropped };
}
