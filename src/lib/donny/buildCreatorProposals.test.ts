import { describe, it, expect } from 'vitest';
import { buildCreatorProposals } from './buildCreatorProposals';

const EMPTY = {
  invitations: [], invitationsError: false,
  contentTodo: [], contentTodoError: false,
  applications: [], applicationsError: false,
  payout: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 0, activeCollaborationCount: 0 },
  payoutError: false,
  dismissedIds: [] as string[],
};
const invite = (id: string) => ({
  invitationId: `i${id}`, campaignId: `c${id}`, campaignTitle: `Campaign ${id}`,
  businessName: 'Joe\'s Pizza', createdAt: '2026-08-02T14:00:00Z',
});
const ids = (r: ReturnType<typeof buildCreatorProposals>) => r.proposals.map((p) => p.id);

describe('item C — payouts', () => {
  it('is absent when onboarding is complete', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, hasStripeAccount: true, onboardingComplete: true, collaborationCount: 2 } });
    expect(ids(r).some((i) => i.startsWith('creator:payout'))).toBe(false);
  });

  it('leads with the money when a balance exists, whatever the flag says', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, hasStripeAccount: true, pendingBalance: 360, collaborationCount: 1 } });
    expect(ids(r)[0]).toBe('creator:payout');
    expect(r.proposals[0].text).toContain('$360');
    expect(r.proposals[0].text).not.toContain('Finish');
  });

  // Every branch that can meet a creator who ALREADY finished onboarding must
  // be true even then — `stripe_onboarding_complete` goes stale-false (#173),
  // so "you aren't set up" would be a false accusation on the page's top row.
  it('says CHECK, never "set up", when an account exists but the flag is false', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, hasStripeAccount: true } });
    const row = r.proposals.find((p) => p.id === 'creator:payout')!;
    expect(row.text).toBe('Check your payout setup so you can get paid');
    expect(row.text).not.toMatch(/set up payouts|finish|aren't|not set up/i);
  });

  it('says SET UP only when there is no stripe account to be stale about', () => {
    const row = buildCreatorProposals(EMPTY).proposals.find((p) => p.id === 'creator:payout')!;
    expect(row.text).toBe('Set up payouts so you can get paid');
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
      payout: { ...EMPTY.payout, collaborationCount: 1, activeCollaborationCount: 1 },
      contentTodo: [{ collaborationId: 'k1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }] });
    expect(ids(r)[0]).toBe('creator:payout');
  });

  it('still ranks FIRST on a COMPLETED collaboration — lifetime work counts here', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, collaborationCount: 1, activeCollaborationCount: 0 } });
    expect(ids(r)[0]).toBe('creator:payout');
  });
});

describe('ordering — A, B then D, with C swapping ends', () => {
  const withWork = {
    contentTodo: [{ collaborationId: 'k1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }],
    applications: [{ applicationId: 'a1', campaignId: 'c2', campaignTitle: 'Brunch', createdAt: '2026-08-01T00:00:00Z' }],
    invitations: [invite('3')],
  };

  // PROPOSAL_CAP is 3, so this interleave decides what a creator actually sees.
  it('keeps A before B before D when payout is silent', () => {
    const r = buildCreatorProposals({ ...EMPTY, ...withWork,
      payout: { ...EMPTY.payout, hasStripeAccount: true, onboardingComplete: true, collaborationCount: 1, activeCollaborationCount: 1 } });
    expect(ids(r)).toEqual([
      'creator:content_todo:k1',
      'creator:application:a1',
      'creator:invitation:c3',
    ]);
  });

  it('puts payout at the FRONT of that same order when work is in flight', () => {
    const r = buildCreatorProposals({ ...EMPTY, ...withWork,
      payout: { ...EMPTY.payout, collaborationCount: 1, activeCollaborationCount: 1 } });
    expect(r.allProposalIds).toEqual([
      'creator:payout',
      'creator:content_todo:k1',
      'creator:application:a1',
      'creator:invitation:c3',
    ]);
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

  it('does not fire when an ACTIVE collaboration exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, collaborationCount: 1, activeCollaborationCount: 1 } });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  // The state a creator lands in the moment they finish a campaign — and the
  // one most worth catching. A lifetime count would call finished work "in
  // flight" and leave them with an empty attention region instead of the one
  // nudge that matters.
  it('DOES fire when every collaboration is finished', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, hasStripeAccount: true, onboardingComplete: true, collaborationCount: 3, activeCollaborationCount: 0 } });
    expect(ids(r)).toContain('creator:find_work');
  });

  it('leaves no creator with an empty attention list in that state', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      payout: { ...EMPTY.payout, hasStripeAccount: true, onboardingComplete: true, collaborationCount: 3, activeCollaborationCount: 0 } });
    expect(r.proposals.length).toBeGreaterThan(0);
  });

  it('does not fire when a content-todo item exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      contentTodo: [{ collaborationId: 'k1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }] });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when a pending application exists', () => {
    const r = buildCreatorProposals({ ...EMPTY,
      applications: [{ applicationId: 'a1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', createdAt: '2026-08-01T00:00:00Z' }] });
    expect(ids(r)).not.toContain('creator:find_work');
  });
});

describe('item E — error guard (a failed read is not proof of an empty plate)', () => {
  it('does not fire when the payout read errored', () => {
    const r = buildCreatorProposals({ ...EMPTY, payout: undefined, payoutError: true });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when the content-todo read errored', () => {
    const r = buildCreatorProposals({ ...EMPTY, contentTodo: undefined, contentTodoError: true });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when the applications read errored', () => {
    const r = buildCreatorProposals({ ...EMPTY, applications: undefined, applicationsError: true });
    expect(ids(r)).not.toContain('creator:find_work');
  });

  it('does not fire when the invitations read errored', () => {
    const r = buildCreatorProposals({ ...EMPTY, invitations: undefined, invitationsError: true });
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
