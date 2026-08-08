/**
 * Ordering and "new since last visit" for the Dragon Feed.
 *
 * The feed used to call `sort(() => Math.random() - 0.5)` on every mount, so the same content
 * appeared in a different order on every page load. That is why nothing could signal "new" —
 * there was no order to be new *relative to*, and no per-item timestamp at all.
 *
 * A feed item is a string in `creator_profiles.portfolio_urls`, so the timestamp comes from the
 * storage object the path points at (`storage.objects.created_at`). We deliberately do NOT parse
 * the `${kind}-${Date.now()}` millis embedded in the filename by `uploadProfileAsset`: that value
 * is client-supplied, and a creator writing to their own folder could craft a future timestamp to
 * pin their work to the top of the feed permanently. The storage timestamp is server-assigned.
 */

export interface FeedOrderable {
  /** ISO timestamp from storage.objects.created_at; undefined when the object wasn't found. */
  uploadedAt?: string;
}

/** ms since epoch, or null when unknown/unparseable. */
function timeOf(item: FeedOrderable): number | null {
  if (!item.uploadedAt) return null;
  const t = Date.parse(item.uploadedAt);
  return Number.isNaN(t) ? null : t;
}

/**
 * Newest first. Items with no known timestamp sort to the END (never interleaved into dated
 * results, where they would claim a recency they can't support) and keep their relative order.
 */
export function sortByUploadedAt<T extends FeedOrderable>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, t: timeOf(item) }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.index - b.index;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      if (a.t !== b.t) return b.t - a.t;
      return a.index - b.index; // stable tie-break
    })
    .map(({ item }) => item);
}

/**
 * Is this item newer than the viewer's last visit?
 *
 * A first-ever visit (`lastVisit` null) returns false for everything: badging the entire feed NEW
 * is noise, not signal. An item with no known timestamp is never NEW — we don't guess.
 */
export function isNewSince(item: FeedOrderable, lastVisit: string | null): boolean {
  if (!lastVisit) return false;
  const cutoff = Date.parse(lastVisit);
  if (Number.isNaN(cutoff)) return false;
  const t = timeOf(item);
  return t !== null && t > cutoff;
}

/** How many items are newer than the viewer's last visit. */
export function countNewSince(items: FeedOrderable[], lastVisit: string | null): number {
  return items.reduce((n, item) => (isNewSince(item, lastVisit) ? n + 1 : n), 0);
}
