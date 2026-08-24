import { describe, it, expect } from 'vitest';
import { computeAccountReadiness } from './index';
import type { ReadinessContext } from './types';

const complete: ReadinessContext = {
  role: 'content_creator',
  emailVerified: true,
  displayName: 'Diana P.',
  imageUrl: 'https://example.test/a.png',
  phoneVerifiedAt: '2026-08-23T00:00:00Z',
  dismissed: [],
  orgUnits: undefined,
  orgMemberCount: undefined,
  orgInvitedCount: undefined,
  stripe: { hasAccount: true, onboardingComplete: true },
  socialActiveCount: 1,
  creator: { skills: ['photography'], bio: 'I shoot food.', portfolioUrls: ['https://example.test/1'] },
  identity: { verifiedAt: '2026-08-23T00:00:00Z', requirementsDue: [], disabledReason: null },
  addressVerifiedAt: '2026-08-23T00:00:00Z',
};

describe('computeAccountReadiness', () => {
  it('resolves every requirement for the role and drops the derive function', () => {
    const r = computeAccountReadiness(complete);
    expect(r.requirements.length).toBeGreaterThan(0);
    expect(r.requirements.every((x) => 'state' in x)).toBe(true);
    expect((r.requirements[0] as unknown as Record<string, unknown>).derive).toBeUndefined();
  });

  it('a fully complete account has nothing outstanding', () => {
    expect(computeAccountReadiness(complete).outstanding).toEqual([]);
  });

  it('splits required from recommended', () => {
    const r = computeAccountReadiness(complete);
    expect(r.required.some((x) => x.key === 'stripe')).toBe(true);
    expect(r.recommended.some((x) => x.key === 'social_linked')).toBe(true);
  });

  it('blocks an action when a demanded requirement is unmet', () => {
    const r = computeAccountReadiness({ ...complete, stripe: { hasAccount: false, onboardingComplete: false } });
    expect(r.isBlocked('apply_campaign')).toBe(true);
    expect(r.missingFor('apply_campaign').map((x) => x.key)).toEqual(['stripe']);
  });

  it('blocks an action while Stripe is pending, preserving current behaviour', () => {
    const r = computeAccountReadiness({ ...complete, stripe: { hasAccount: true, onboardingComplete: false } });
    expect(r.isBlocked('apply_campaign')).toBe(true);
    expect(r.missingFor('apply_campaign')[0].state.status).toBe('pending');
  });

  /** The contract that must not break. */
  it('NEVER blocks on unknown — fail-open', () => {
    const r = computeAccountReadiness({ ...complete, stripe: undefined });
    expect(r.missingFor('apply_campaign')).toEqual([]);
    expect(r.isBlocked('apply_campaign')).toBe(false);
  });

  it('unknown requirements are not counted as outstanding', () => {
    const r = computeAccountReadiness({ ...complete, socialActiveCount: undefined });
    expect(r.outstanding.some((x) => x.key === 'social_linked')).toBe(false);
  });
});
