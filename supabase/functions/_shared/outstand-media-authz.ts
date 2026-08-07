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

/** The rows of one provider media page, in order, whatever shape carried them. */
export function extractMediaRows(bodyText: string): Record<string, unknown>[] {
  if (!bodyText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  // Prefer a top-level array; otherwise the first array-of-objects found, at any
  // depth. Same reasoning as the filter: keying on a name silently misses the
  // array the provider adds or renames next.
  if (Array.isArray(parsed)) {
    return parsed.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
  }

  const seen = new WeakSet<object>();
  const find = (node: Record<string, unknown>, depth: number): Record<string, unknown>[] | null => {
    if (depth > 6 || seen.has(node)) return null;
    seen.add(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value) && value.some((e) => e !== null && typeof e === 'object')) {
        return value.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const found = find(value as Record<string, unknown>, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return find(parsed as Record<string, unknown>, 0) ?? [];
}

export interface OwnedWindow {
  /** The rows to return: the caller's own media, sliced to [offset, offset+limit). */
  rows: Record<string, unknown>[];
  /** True when the provider was exhausted, so `offset+limit` is genuinely past the end. */
  exhausted: boolean;
}

/**
 * Take the caller's OWN window out of a stream of provider pages.
 *
 * WHY THIS EXISTS. `GET /media?limit&offset` paginates over the ORG-WIDE pool,
 * and only then does ownership filtering happen. So with several tenants a
 * caller could ask for page 1, receive a page consisting entirely of other
 * tenants' uploads, and be shown an EMPTY gallery while their own media sat
 * further down the org ordering. Filtering a single page cannot fix that — the
 * page was chosen before ownership was known.
 *
 * The fix is to page the provider until the caller's own window is filled, and
 * slice from the owned sequence rather than the org one. `offset` then means
 * what the caller thinks it means: an offset into THEIR media.
 *
 * Pure: the caller supplies pages, this decides when to stop.
 */
export function collectOwnedWindow(
  pages: Iterable<Record<string, unknown>[]>,
  ownedIdsPerPage: Iterable<ReadonlySet<string>>,
  offset: number,
  limit: number,
): OwnedWindow {
  const need = Math.max(0, offset) + Math.max(0, limit);
  const owned: Record<string, unknown>[] = [];
  const pageIter = pages[Symbol.iterator]();
  const ownedIter = ownedIdsPerPage[Symbol.iterator]();
  let exhausted = true;

  for (;;) {
    const page = pageIter.next();
    const ids = ownedIter.next();
    if (page.done || ids.done) break;

    for (const row of page.value) {
      const id = row.id;
      if (typeof id === 'string' && (ids.value as ReadonlySet<string>).has(id)) owned.push(row);
    }
    if (owned.length >= need) {
      exhausted = false;
      break;
    }
  }

  return { rows: owned.slice(Math.max(0, offset), need), exhausted };
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

// filterMediaList() and collectMediaIds() lived here.
//
// They filtered ONE provider page to the caller's own rows, which was the right
// shape only while the page itself was assumed correct. It is not: `GET /media`
// paginates the ORG-WIDE pool, so the page is chosen before ownership is known
// and a caller could receive an empty page while their own media sat further
// down. The proxy now pages over the OWNED sequence instead
// (extractMediaRows + collectOwnedWindow above), which makes single-page
// filtering not merely redundant but misleading — a helper that looks like a
// safety net while protecting nothing is worse than no helper at all.
//
// Same reasoning that deleted _shared/schedule-completion.ts when the rule moved
// into SQL.
