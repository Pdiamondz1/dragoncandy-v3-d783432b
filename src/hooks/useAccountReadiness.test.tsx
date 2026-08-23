// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.current }));
vi.mock('@/hooks/useOrgData', () => ({ useOrgUnits: () => ({ data: undefined }) }));
vi.mock('@/hooks/outstand/useLocationSocialAccounts', () => ({
  useLocationSocialAccounts: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

// A real `.from()` mock (unlike the `{}` stub the whole-hook test needs) so
// `fetchAccountReadinessDetail` — the extracted, directly-testable fact-reading
// unit — can be exercised against controlled Supabase responses below.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

import { useAccountReadiness, fetchAccountReadinessDetail } from './useAccountReadiness';
import { computeAccountReadiness, type ReadinessContext } from '@/lib/accountReadiness';

/**
 * A minimal chainable Supabase query-builder stub.
 * Supports `.select().eq().maybeSingle()` (the profile / role-profile reads)
 * AND being awaited directly straight off `.eq()` (the `{ count, head: true }`
 * org_members read, which never calls `.maybeSingle()`).
 */
function stubQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => resolved),
    then: resolved.then.bind(resolved),
  };
  return chain;
}

const baseCtx: ReadinessContext = {
  role: 'business_client',
  emailVerified: undefined,
  displayName: undefined,
  imageUrl: undefined,
  phoneVerifiedAt: undefined,
  dismissed: [],
  orgUnits: undefined,
  orgMemberCount: undefined,
  stripe: undefined,
  socialActiveCount: undefined,
  creator: undefined,
  identity: undefined,
  addressVerifiedAt: undefined,
};

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

describe('fetchAccountReadinessDetail', () => {
  beforeEach(() => {
    supabaseMock.from.mockReset();
  });

  it('never queries org_members and reports memberCount as undefined while orgId is unresolved', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') return stubQuery({ data: { email_verified: true }, error: null });
      if (table === 'business_profiles') return stubQuery({ data: { business_name: "Joe's" }, error: null });
      throw new Error(`unexpected table queried while orgId was unresolved: ${table}`);
    });

    const detail = await fetchAccountReadinessDetail('u1', 'business_profiles', false, undefined);

    expect(detail.memberCount).toBeUndefined();
    expect(supabaseMock.from).not.toHaveBeenCalledWith('org_members');

    // The regression this guards: a fact we couldn't read must derive `unknown`,
    // never a negative (`unmet`) — an unresolved org is not the same as an
    // empty one.
    const team = computeAccountReadiness({ ...baseCtx, orgMemberCount: detail.memberCount })
      .requirements.find((r) => r.key === 'team');
    expect(team?.state.status).toBe('unknown');
  });

  it('reads the real member count once orgId is known, and the team requirement reflects it', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') return stubQuery({ data: { email_verified: true }, error: null });
      if (table === 'business_profiles') return stubQuery({ data: { business_name: "Joe's" }, error: null });
      if (table === 'org_members') return stubQuery({ count: 3, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    const detail = await fetchAccountReadinessDetail('u1', 'business_profiles', false, 'org-1');

    expect(detail.memberCount).toBe(3);
    expect(supabaseMock.from).toHaveBeenCalledWith('org_members');

    const team = computeAccountReadiness({ ...baseCtx, orgMemberCount: detail.memberCount })
      .requirements.find((r) => r.key === 'team');
    expect(team?.state.status).toBe('met');
  });

  it('degrades a failed read to undefined rather than a falsy fact, and logs it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') return stubQuery({ data: null, error: { message: 'boom' } });
      if (table === 'business_profiles') return stubQuery({ data: { business_name: "Joe's" }, error: null });
      if (table === 'org_members') return stubQuery({ count: null, error: { message: 'boom' } });
      throw new Error(`unexpected table: ${table}`);
    });

    const detail = await fetchAccountReadinessDetail('u1', 'business_profiles', false, 'org-1');

    expect(detail.prof).toBeUndefined();
    expect(detail.roleProfile).toBeDefined();
    expect(detail.memberCount).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
