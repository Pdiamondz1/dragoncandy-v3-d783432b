/**
 * Per-day dedup for Dragon Feed view events.
 *
 * A "view" is the viewer opening an item in the lightbox. We count it at most once per user, per
 * item, per UTC day, so a single browsing session that pages back and forth doesn't inflate the
 * number. This is a **best-effort engagement counter, not a billing ledger** — the dedup lives in
 * localStorage, so a cleared browser or a second device can double-count. That tradeoff is
 * deliberate: a server-side dedup ledger would mean a table, an RLS policy and a round-trip per
 * item open, which is not worth it for a signal used only to rank and to display "N views".
 */

/** Minimal surface we need from localStorage, so this is testable without a DOM. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** UTC day stamp — YYYY-MM-DD. UTC (not local) so travel/DST can't produce two "days" at once. */
export function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function viewDedupKey(userId: string, itemId: string, now: Date): string {
  return `dc:dragonfeed:viewed:${userId}:${dayStamp(now)}:${itemId}`;
}

/**
 * Should this view be recorded? Marks it as seen when it returns true, so calling twice in a row
 * yields true then false. A storage failure returns false — under-counting beats double-counting a
 * number we display.
 */
export function claimViewOncePerDay(
  store: KeyValueStore,
  userId: string,
  itemId: string,
  now: Date = new Date(),
): boolean {
  if (!userId || !itemId) return false;
  const key = viewDedupKey(userId, itemId, now);
  try {
    if (store.getItem(key)) return false;
    store.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}
