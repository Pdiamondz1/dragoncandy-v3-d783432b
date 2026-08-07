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

// filterMediaList(), collectMediaIds(), extractMediaRows() and
// collectOwnedWindow() lived here.
//
// They filtered ONE provider page to the caller's own rows, which was the right
// shape only while the page itself was assumed correct. It is not: `GET /media`
// paginates the ORG-WIDE pool, so the page is chosen before ownership is known
// and a caller could receive an empty page while their own media sat further
// down. Scanning the org pool for owned rows replaced it, and failed
// structurally in turn: a hard scan cap made media beyond it permanently
// unreachable, and raising the cap only moves the wall.
//
// GET /media is now served entirely from outstand_media_ownership, which the
// confirm step populates with the provider's own record. No org list is read at
// all, so none of these helpers has anything to filter — and a helper that looks
// like a safety net while protecting nothing is worse than no helper at all.
//
// Same reasoning that deleted _shared/schedule-completion.ts when the rule moved
// into SQL.

/** The provider's media record, as `POST /media/{id}/confirm` returns it. */
export interface ConfirmedMedia {
  filename: string | null;
  url: string | null;
  contentType: string | null;
  size: number | null;
  status: string | null;
  mediaCreatedAt: string | null;
  expiresAt: string | null;
}

/**
 * Read the media record out of a confirm response.
 *
 * The SDK types this as `ConfirmUploadResponse { id, filename, url,
 * content_type, size, status, created_at, expires_at }`, usually inside an
 * `ApiResponse` envelope — so look at the root and under `data`, and nowhere
 * else, for the same reason extractUploadedMediaId is narrow: what this returns
 * is persisted and later served as fact.
 *
 * Returns null only when there is no recognisable record. Individual missing
 * fields are kept as null rather than failing the whole read: a confirm that
 * omits `expires_at` should still produce a usable gallery row.
 *
 * NOTE the deliberate rename: the provider's `created_at` becomes
 * `mediaCreatedAt`, because the row it lands in already has a `created_at`
 * meaning "when WE minted the binding". Two different times under one name is
 * how a chart ends up plotting the wrong one.
 */
export function extractConfirmedMedia(body: unknown): ConfirmedMedia | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const dataObj = asObject(root.data);
  const rec = asObject(dataObj?.media) ?? dataObj ?? root;

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const media: ConfirmedMedia = {
    filename: str(rec.filename),
    url: str(rec.url),
    contentType: str(rec.content_type) ?? str((rec as { contentType?: unknown }).contentType),
    size: num(rec.size),
    status: str(rec.status),
    mediaCreatedAt: str(rec.created_at),
    expiresAt: str(rec.expires_at),
  };

  // A record with no url is not a media file — the gallery has nothing to show
  // and storing it would put an unrenderable row in someone's list.
  return media.url ? media : null;
}

/** One row of outstand_media_ownership, as stored. */
export interface StoredMediaRow {
  outstand_media_id: string;
  filename?: string | null;
  url?: string | null;
  content_type?: string | null;
  size?: number | null;
  status?: string | null;
  media_created_at?: string | null;
  expires_at?: string | null;
}

/**
 * Render stored rows in the shape the SDK expects.
 *
 * Field names are the PROVIDER's, not our column names, because the gallery
 * reads `MediaFile` — `content_type` and `created_at`, not `contentType` and
 * `media_created_at`. Serving our own schema here would produce a response that
 * parses fine and renders blank.
 */
export function toMediaFiles(rows: readonly StoredMediaRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    id: r.outstand_media_id,
    filename: r.filename ?? '',
    url: r.url ?? '',
    content_type: r.content_type ?? null,
    size: r.size ?? null,
    status: r.status ?? 'active',
    created_at: r.media_created_at ?? null,
    expires_at: r.expires_at ?? null,
  }));
}

/**
 * The envelope `useMediaList` reads.
 *
 * `useMediaList` returns `media: data?.data ?? []` and
 * `pagination: data?.pagination ?? null`. An earlier version omitted
 * `pagination` entirely, which reported a populated gallery as 0 files and
 * removed its next-page control.
 *
 * THE TRAP, and it is a real one: `MediaList` reads
 *
 *     const totalCount = pagination?.count ?? 0;
 *     const totalPages = Math.ceil(totalCount / pageSize);
 *
 * so `pagination.count` is consumed as the TOTAL, not as this page's length —
 * the opposite of the provider's own convention, where a /posts response
 * carries `count: 5` for a 5-row page alongside `total: 49`. Emitting the
 * honest reading (page length) makes a 20-of-100 gallery display "20 files" and
 * hide Next. So `pagination.count` carries the total deliberately.
 *
 * The top-level `count` keeps the provider's meaning (this page's length);
 * nothing reads it, and matching the provider there costs nothing. Where the
 * two conventions disagree, serve what actually renders.
 */
export function buildMediaListResponse(
  files: readonly Record<string, unknown>[],
  total: number,
  limit: number,
  offset: number,
): string {
  return JSON.stringify({
    success: true,
    data: files,
    count: files.length,
    total,
    limit,
    offset,
    // count = total ON PURPOSE — see the note above.
    pagination: { limit, offset, total, count: total },
  });
}

/** Clamp caller-supplied paging to something sane. */
export function parseMediaPaging(search: string): { limit: number; offset: number } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const rawOffset = parseInt(params.get('offset') ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { limit, offset };
}
