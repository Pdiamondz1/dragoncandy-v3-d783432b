// _shared/outstand-media-authz.ts — may this caller touch this Outstand media?
//
// Sibling of _shared/outstand-post-authz.ts, and pure for the same reason:
// outstand-proxy/index.ts calls serve() at module load and is not
// import-testable, and this decides access through an ORG-WIDE provider key.
//
// THE DEFECT THIS REPLACES. enforceScope allowed `/media`, `/media/upload`,
// `/media/{id}` and `/media/{id}/confirm` for EVERY method to ANY authenticated
// caller. The Outstand key is org-wide, so every tenant's uploads live in one
// pool: any authenticated user could list every tenant's media (filenames and
// URLs) and DELETE any of it. The SDK calls all four, `DELETE /media/{id}`
// included, so this was a live path.
//
// WHY OWNERSHIP CANNOT BE DERIVED FROM THE ROW. The SDK's MediaFile is
// { id, url, filename, contentType, size, status, created_at, expires_at } —
// no account, user or org field, and the provider exposes no per-tenant scope.
// There is literally nothing on a media row to filter by. So ownership is
// recorded on our side at upload time (outstand_media_ownership) and every
// decision here consults that binding.

/**
 * The media id from a `POST /media/upload` response.
 *
 * The SDK types the payload as `UploadUrlResponse { id, upload_url, expires_in }`,
 * usually inside an `ApiResponse` envelope — so accept the id at the root or
 * under `data`, and nowhere else. Deliberately narrow: this id becomes a
 * BINDING, so a loose reader is a way to bind the wrong thing. Anything
 * unrecognised yields null and simply mints no binding, which fails CLOSED
 * (the uploader then cannot confirm or delete their own upload, which is
 * visible and fixable — the opposite mistake would hand them someone else's).
 */
export function extractUploadedMediaId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;

  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const dataObj = asObject(root.data);
  const dataMedia = asObject(dataObj?.media);

  for (const candidate of [dataMedia?.id, dataObj?.id, root.id]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

/**
 * Every media id appearing in a list response, at any depth.
 *
 * Used to ask the binding table "which of THESE are mine?" instead of "give me
 * all my media ids". The difference matters: the caller-owned set is unbounded
 * and would be silently truncated by PostgREST's default row cap, so a user
 * with more uploads than the cap would find their own media missing from their
 * own gallery. The ids on one page are bounded by the page size.
 */
export function collectMediaIds(bodyText: string): string[] {
  if (!bodyText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [];
  }

  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.length > 0) ids.add(obj.id);
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(parsed, 0);
  return [...ids];
}

export type MediaAccessDecision =
  | { allowed: true; grant: 'ownership_binding' }
  | { allowed: false; reason: 'no_binding' | 'not_owner' };

/**
 * May this caller act on this specific media id?
 *
 * STRICT — no binding means no. This is safe to be strict about in a way the
 * post equivalent was not: `GET /media` returned `count: 0` on prod when this
 * shipped, so there is no pre-binding population to strand. Every media id that
 * will ever exist from here is minted through the proxy with a binding.
 *
 * `bindingUserId` is null both when there is no binding AND when the read
 * failed — the caller collapses those deliberately, because both mean the same
 * thing to this decision: no positive evidence, therefore no.
 */
export function decideMediaAccess(
  bindingUserId: string | null,
  callerUserId: string,
): MediaAccessDecision {
  if (typeof bindingUserId !== 'string' || bindingUserId.length === 0) {
    return { allowed: false, reason: 'no_binding' };
  }
  // Both sides non-empty and equal. Without the length guard above, a null
  // caller id could match a null binding and grant on two absences.
  if (bindingUserId !== callerUserId) {
    return { allowed: false, reason: 'not_owner' };
  }
  return { allowed: true, grant: 'ownership_binding' };
}

/**
 * Filter a `GET /media` list response down to the caller's own media.
 *
 * Separate from _shared/outstand-list-filter.ts on purpose: that module decides
 * ownership from FIELDS ON THE ROW (a post carries its social accounts). A media
 * row carries nothing, so ownership can only come from an id set fetched
 * alongside. Same shape of walk, different evidence.
 *
 * Filters EVERY array of rows, at any depth, for the same reason the post filter
 * does: a name-keyed allow-list silently forwards any array the provider adds or
 * renames, and the response still looks filtered. A row whose id cannot be read
 * is DROPPED — unattributable is not owned.
 */
export function filterMediaList(bodyText: string, ownedMediaIds: ReadonlySet<string>): {
  body: string;
  kept: number;
  dropped: number;
} {
  if (!bodyText) return { body: bodyText, kept: 0, dropped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { body: bodyText, kept: 0, dropped: 0 };
  }
  if (!parsed || typeof parsed !== 'object') return { body: bodyText, kept: 0, dropped: 0 };

  const isOwned = (item: unknown): boolean => {
    const id = (item as { id?: unknown } | null)?.id;
    return typeof id === 'string' && ownedMediaIds.has(id);
  };
  const isRowList = (v: unknown): boolean =>
    Array.isArray(v) && v.some((e) => e !== null && typeof e === 'object');

  const kept = new Set<string>();
  let dropped = 0;
  const MAX_DEPTH = 6;
  const seen = new WeakSet<object>();

  // A collection can also arrive as an OBJECT KEYED BY ID rather than an array
  // — `{ media: { "abc": {...}, "def": {...} } }`. An array-only filter walks
  // straight into that and forwards every row untouched, which is the same shape
  // of miss as filtering `data` while `posts` rode alongside. Detected by: every
  // value is a non-null object, and at least one carries a string `id`.
  //
  // `pagination: { limit, offset, total }` is not mistaken for one, because its
  // values are numbers rather than objects.
  const isRowMap = (v: unknown): boolean => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const values = Object.values(v as Record<string, unknown>);
    if (values.length === 0) return false;
    if (!values.every((e) => e !== null && typeof e === 'object' && !Array.isArray(e))) return false;
    return values.some((e) => typeof (e as { id?: unknown }).id === 'string');
  };

  const walk = (node: Record<string, unknown>, depth: number): void => {
    if (depth > MAX_DEPTH || seen.has(node)) return;
    seen.add(node);
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (isRowList(value)) {
        const before = (value as unknown[]).length;
        const filtered = (value as unknown[]).filter(isOwned);
        node[key] = filtered;
        for (const row of filtered) {
          const id = (row as { id?: unknown }).id;
          if (typeof id === 'string') kept.add(id);
        }
        dropped += before - filtered.length;
        continue;
      }
      if (isRowMap(value)) {
        const src = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, row] of Object.entries(src)) {
          if (isOwned(row)) {
            out[k] = row;
            const id = (row as { id?: unknown }).id;
            if (typeof id === 'string') kept.add(id);
          } else {
            dropped += 1;
          }
        }
        node[key] = out;
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, depth + 1);
      }
    }
  };

  if (Array.isArray(parsed)) {
    const before = parsed.length;
    const filtered = (parsed as unknown[]).filter(isOwned);
    dropped = before - filtered.length;
    for (const row of filtered) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string') kept.add(id);
    }
    return { body: JSON.stringify(filtered), kept: kept.size, dropped };
  }

  walk(parsed as Record<string, unknown>, 0);

  // Counters must not survive filtering — `total` would otherwise report the
  // whole org's media count. Same rule as the post list filter.
  const ROW_COUNTER = /^(count|total|totalCount|total_count)$/;
  // Page counters describe the same org-wide set in another spelling, so they
  // leak the same fact. Missed on the first pass here even though the sibling
  // post filter already covers them.
  const PAGE_COUNTER = /^(totalPages|total_pages|pages)$/;
  const fixCounters = (node: Record<string, unknown>, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (typeof v === 'number' && ROW_COUNTER.test(key)) node[key] = kept.size;
      else if (typeof v === 'number' && PAGE_COUNTER.test(key)) node[key] = kept.size > 0 ? 1 : 0;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        fixCounters(v as Record<string, unknown>, depth + 1);
      }
    }
  };
  fixCounters(parsed as Record<string, unknown>, 0);

  return { body: JSON.stringify(parsed), kept: kept.size, dropped };
}
