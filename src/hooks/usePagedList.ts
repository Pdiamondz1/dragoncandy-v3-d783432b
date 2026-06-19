// src/hooks/usePagedList.ts
import { useState, useEffect } from 'react';

/**
 * Client-side "load more" pagination over an already-fetched array.
 * Renders `visible` (the first `visibleCount` items) and reveals more in
 * `pageSize` batches. Resets to the first page when the list size changes
 * (e.g. switching tabs/filters), so it's safe even when callers pass a
 * freshly-filtered array on every render.
 */
export function usePagedList<T>(items: T[], pageSize = 12) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  // Reset on list-size change (tab/filter switch). Keyed on length — a stable
  // primitive — so a new array identity each render does NOT reset the page.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items.length, pageSize]);

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const loadMore = () => setVisibleCount((c) => Math.min(c + pageSize, items.length));

  return { visible, hasMore, showing: visible.length, total: items.length, loadMore };
}
