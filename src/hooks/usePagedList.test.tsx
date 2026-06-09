// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePagedList } from './usePagedList';

describe('usePagedList', () => {
  it('shows only the first page and hides Load more when total <= pageSize', () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    const { result } = renderHook(() => usePagedList(items, 12));
    expect(result.current.visible).toHaveLength(11);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.showing).toBe(11);
    expect(result.current.total).toBe(11);
  });

  it('reveals the next batch on loadMore', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const { result } = renderHook(() => usePagedList(items, 12));
    expect(result.current.visible).toHaveLength(12);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(24);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(30);
    expect(result.current.hasMore).toBe(false);
  });

  it('resets to the first page when the list size changes (tab/filter switch)', () => {
    const big = Array.from({ length: 30 }, (_, i) => i);
    const small = Array.from({ length: 5 }, (_, i) => i);
    const { result, rerender } = renderHook(({ items }) => usePagedList(items, 12), {
      initialProps: { items: big },
    });
    act(() => result.current.loadMore());
    expect(result.current.showing).toBe(24);

    rerender({ items: small });
    expect(result.current.visible).toHaveLength(5);
    expect(result.current.hasMore).toBe(false);
  });
});
