import { describe, it, expect } from 'vitest';
import { buildCreatorProposals } from './buildCreatorProposals';

const EMPTY = {
  invitations: [], invitationsError: false,
  contentTodo: [], contentTodoError: false,
  applications: [], applicationsError: false,
  payout: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 0 },
  payoutError: false,
  dismissedIds: [] as string[],
  now: Date.parse('2026-08-10T16:00:00Z'),
};
const invite = (id: string) => ({
  invitationId: `i${id}`, campaignId: `c${id}`, campaignTitle: `Campaign ${id}`,
  businessName: 'Joe\'s Pizza', createdAt: '2026-08-02T14:00:00Z',
});
const ids = (r: ReturnType<typeof buildCreatorProposals>) => r.proposals.map((p) => p.id);

describe('item C — payouts', () => {
  it('is absent when onboarding is complete', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: true, pendingBalance: 0, collaborationCount: 2 } });
    expect(ids(r).some((i) => i.startsWith('creator:payout'))).toBe(false);
  });

  it('leads with the money when a balance exists, whatever the flag says', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: false, pendingBalance: 360, collaborationCount: 1 } });
    expect(ids(r)[0]).toBe('creator:payout');
    expect(r.proposals[0].text).toContain('$360');
    expect(r.proposals[0].text).not.toContain('Finish');
  });

  it('is SILENT when an account exists, the flag is false, and there is no balance', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: true, onboardingComplete: false, pendingBalance: 0, collaborationCount: 0 } });
    expect(ids(r).some((i) => i.startsWith('creator:payout'))).toBe(false);
  });

  it('says set up payouts when there is no stripe account', () => {
    const r = buildCreatorProposals(EMPTY);
    expect(ids(r)).toContain('creator:payout');
  });

  it('ranks BELOW find-work when there is no money and no work', () => {
    const r = buildCreatorProposals(EMPTY);
    expect(ids(r)).toEqual(['creator:find_work', 'creator:payout']);
  });

  it('ranks FIRST when a collaboration exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 1 },
      contentTodo: [{ collaborationId: 'k1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }] });
    expect(ids(r)[0]).toBe('creator:payout');
  });
});

describe('item D — invitations', () => {
  it('emits ONE row per invitation, not an aggregate', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1'), invite('2')] });
    expect(ids(r)).toContain('creator:invitation:c1');
    expect(ids(r)).toContain('creator:invitation:c2');
  });

  it('never implies an assignment', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')] });
    const text = r.proposals.find((p) => p.id === 'creator:invitation:c1')!.text;
    expect(text).toContain('asked you to apply');
    expect(text).not.toMatch(/selected|accept|assigned/i);
  });
});

describe('item E — find work', () => {
  it('fires only when nothing is in flight', () => {
    expect(ids(buildCreatorProposals(EMPTY))).toContain('creator:find_work');
  });

  it('does not fire when an invitation exists', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')] });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when a collaboration exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, collaborationCount: 1 } });
    expect(ids(r)).not.toContain('creator:find_work');
  });
});

describe('errors and contract', () => {
  it('an errored input contributes no proposal, never a zero', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: undefined, invitationsError: true });
    expect(ids(r).some((i) => i.startsWith('creator:invitation'))).toBe(false);
  });

  it('blocker is always null for creators', () => {
    expect(buildCreatorProposals(EMPTY).blocker).toBeNull();
  });

  it('allProposalIds holds the full pre-cap list so a dismissal below the cap is not resurrected', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      invitations: [invite('1'), invite('2'), invite('3'), invite('4')] });
    expect(r.proposals.length).toBe(3);
    expect(r.allProposalIds.length).toBeGreaterThan(3);
    expect(r.overflowCount).toBeGreaterThan(0);
  });

  it('respects dismissals', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: [invite('1')],
      dismissedIds: ['creator:invitation:c1'] });
    expect(ids(r)).not.toContain('creator:invitation:c1');
  });
});
