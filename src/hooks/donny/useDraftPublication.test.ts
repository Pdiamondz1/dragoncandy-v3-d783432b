// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDraftPublication } from './useDraftPublication';

// The property under test is the FAIL-CLOSED reading of each state, not the
// query itself: every state short of a definite "not published" must keep the
// publish button down, because this is the one Donny card whose action cannot
// be undone.
const auth = { user: { id: 'user-1' } as { id: string } | null };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const query = {
  data: null as unknown,
  isLoading: false,
  error: null as Error | null,
};
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => query,
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

beforeEach(() => {
  auth.user = { id: 'user-1' };
  query.data = null;
  query.isLoading = false;
  query.error = null;
});

describe('useDraftPublication', () => {
  it('reports published when a marker row exists', () => {
    query.data = { published_at: '2026-08-09T00:00:00Z' };
    const { result } = renderHook(() => useDraftPublication('draft-1'));
    expect(result.current.isPublished).toBe(true);
  });

  it('reports not-published, and not loading, once the lookup returns nothing', () => {
    const { result } = renderHook(() => useDraftPublication('draft-1'));
    expect(result.current.isPublished).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isUnknown).toBe(false);
  });

  it('treats a missing session as NOT KNOWN, never as safe to send', () => {
    // React Query reports a DISABLED query as not-loading, so without an
    // explicit `!user` term this returns all-false during the auth-loading
    // window and the card arms itself with no guard behind it.
    auth.user = null;
    const { result } = renderHook(() => useDraftPublication('draft-1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPublished).toBe(false);
  });

  it('surfaces a read failure as unknown, distinct from not-published', () => {
    query.error = new Error('network');
    const { result } = renderHook(() => useDraftPublication('draft-1'));
    expect(result.current.isUnknown).toBe(true);
    expect(result.current.isPublished).toBe(false);
  });

  it('is not loading when there is no draft id — the card refuses on that alone', () => {
    // A missing id is handled by the card as `cannotVerify`, not by pretending
    // a lookup is in flight that will never resolve.
    const { result } = renderHook(() => useDraftPublication(undefined));
    expect(result.current.isLoading).toBe(false);
  });
});
