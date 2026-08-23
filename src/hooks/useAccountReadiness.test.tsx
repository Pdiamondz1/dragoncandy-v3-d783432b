// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.current }));
vi.mock('@/hooks/useOrgData', () => ({ useOrgUnits: () => ({ data: undefined }) }));
vi.mock('@/hooks/outstand/useLocationSocialAccounts', () => ({
  useLocationSocialAccounts: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useAccountReadiness } from './useAccountReadiness';

describe('useAccountReadiness', () => {
  it('fails open across the board when every source is unresolved', () => {
    auth.current = { user: { id: 'u1' }, profile: { role: 'content_creator' } };
    const { result } = renderHook(() => useAccountReadiness('content_creator'));

    // Nothing definitive is known, so nothing is actionable and nothing blocks.
    expect(result.current.outstanding).toEqual([]);
    expect(result.current.isBlocked('apply_campaign')).toBe(false);
    expect(result.current.requirements.every((r) => r.state.status === 'unknown')).toBe(true);
  });
});
