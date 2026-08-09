import { describe, it, expect } from 'vitest';
import {
  buildDonnyProposals,
  DEADLINE_SOON_DAYS,
  PROPOSAL_CAP,
  type DonnyProposalsInput,
} from './buildDonnyProposals';
import type { PendingAction } from '@/hooks/usePendingActions';
import type { ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';

const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysFromNow = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function action(over: Partial<PendingAction> = {}): PendingAction {
  return {
    campaignId: 'c1',
    campaignTitle: 'Taco Tuesday',
    actionType: 'review_application',
    creatorName: 'Ricky Ricardo',
    occurredAt: hoursAgo(2),
    ...over,
  };
}

function campaign(over: Partial<ActiveCampaignItem> = {}): ActiveCampaignItem {
  return {
    id: 'c1',
    title: 'Taco Tuesday',
    status: 'active',
    displayStatus: 'Active',
    deadline: null,
    creatorName: null,
    ...over,
  };
}

const readyLocation = {
  hasActiveLocation: true,
  isReady: true,
  locationName: 'Hoboken',
  missingSocial: false,
  missingStripe: false,
};

function input(over: Partial<DonnyProposalsInput> = {}): DonnyProposalsInput {
  return {
    pendingActions: [],
    pendingActionsError: false,
    campaigns: [],
    readiness: readyLocation,
    dismissedIds: [],
    now: NOW,
    ...over,
  };
}

describe('buildDonnyProposals — pending actions', () => {
  it('turns a pending application into a proposal in Donny\'s voice', () => {
    const { proposals } = buildDonnyProposals(input({ pendingActions: [action()] }));
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('pending_action');
    expect(proposals[0].text).toBe('Ricky Ricardo applied to "Taco Tuesday"');
    expect(proposals[0].occurredAt).toBe(hoursAgo(2));
    expect(proposals[0].dismissible).toBe(true);
    expect(proposals[0].cta).toEqual({
      kind: 'route',
      label: 'Review application',
      route: '/dashboard/business/campaigns/c1',
    });
  });

  it('turns submitted content into its own proposal', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ actionType: 'review_content' })] })
    );
    expect(proposals[0].text).toBe('Ricky Ricardo submitted content for "Taco Tuesday"');
    expect(proposals[0].cta).toEqual({
      kind: 'route',
      label: 'Review content',
      route: '/dashboard/business/campaigns/c1',
    });
  });

  it('gives the two action types on ONE campaign distinct ids', () => {
    // The old pendingBannerDismissed_${campaignId} key was campaign-scoped, so
    // dismissing "applied" also silenced "submitted content" for the same
    // campaign — Donny went quiet about delivered work. Not inherited.
    const { proposals } = buildDonnyProposals(
      input({
        pendingActions: [
          action({ actionType: 'review_application' }),
          action({ actionType: 'review_content' }),
        ],
      })
    );
    expect(proposals[0].id).not.toBe(proposals[1].id);
    expect(new Set(proposals.map((p) => p.id)).size).toBe(2);
  });

  it('orders pending actions newest first', () => {
    const { proposals } = buildDonnyProposals(
      input({
        pendingActions: [
          action({ campaignId: 'old', occurredAt: hoursAgo(48) }),
          action({ campaignId: 'new', occurredAt: hoursAgo(1) }),
          action({ campaignId: 'mid', occurredAt: hoursAgo(5) }),
        ],
      })
    );
    expect(proposals.map((p) => p.occurredAt)).toEqual([
      hoursAgo(1),
      hoursAgo(5),
      hoursAgo(48),
    ]);
  });

  it('renders nothing from pending actions when the query errored', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: undefined, pendingActionsError: true })
    );
    expect(proposals).toEqual([]);
  });

  it('falls back to a generic name rather than printing "undefined"', () => {
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ creatorName: '' })] })
    );
    expect(proposals[0].text).toBe('A creator applied to "Taco Tuesday"');
  });
});

describe('buildDonnyProposals — cap, overflow and dismissal', () => {
  const five = [1, 2, 3, 4, 5].map((n) =>
    action({ campaignId: `c${n}`, occurredAt: hoursAgo(n) })
  );

  it('caps at PROPOSAL_CAP and reports the overflow', () => {
    const { proposals, overflowCount } = buildDonnyProposals(input({ pendingActions: five }));
    expect(PROPOSAL_CAP).toBe(3);
    expect(proposals).toHaveLength(3);
    expect(overflowCount).toBe(2);
    expect(proposals.map((p) => p.id)).toEqual([
      'pending_action:review_application:c1',
      'pending_action:review_application:c2',
      'pending_action:review_application:c3',
    ]);
  });

  it('promotes the next proposal when one is dismissed', () => {
    const { proposals, overflowCount } = buildDonnyProposals(
      input({ pendingActions: five, dismissedIds: ['pending_action:review_application:c1'] })
    );
    expect(proposals.map((p) => p.id)).toEqual([
      'pending_action:review_application:c2',
      'pending_action:review_application:c3',
      'pending_action:review_application:c4',
    ]);
    expect(overflowCount).toBe(1);
  });

  it('reports no overflow when nothing is hidden', () => {
    const { overflowCount } = buildDonnyProposals(input({ pendingActions: [action()] }));
    expect(overflowCount).toBe(0);
  });
});

describe('buildDonnyProposals — the deadline signal', () => {
  it('fires inside the window', () => {
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: daysFromNow(2) })] })
    );
    expect(DEADLINE_SOON_DAYS).toBe(3);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('signal');
    expect(proposals[0].id).toBe('signal:deadline:c1');
    expect(proposals[0].text).toBe('"Taco Tuesday" is due in 2 days');
    expect(proposals[0].dismissible).toBe(false);
  });

  it('says "today" and "tomorrow" rather than "in 0 days"', () => {
    const today = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: new Date(NOW + 3_600_000).toISOString() })] })
    );
    expect(today.proposals[0].text).toBe('"Taco Tuesday" is due today');

    const tomorrow = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: daysFromNow(1) })] })
    );
    expect(tomorrow.proposals[0].text).toBe('"Taco Tuesday" is due tomorrow');
  });

  it('does not fire outside the window, on a past deadline, or with no deadline', () => {
    for (const deadline of [daysFromNow(4), daysFromNow(-1), null]) {
      const { proposals } = buildDonnyProposals(input({ campaigns: [campaign({ deadline })] }));
      expect(proposals, String(deadline)).toEqual([]);
    }
  });

  it('only fires for published or active campaigns', () => {
    for (const status of ['published', 'active'] as const) {
      const { proposals } = buildDonnyProposals(
        input({ campaigns: [campaign({ status, deadline: daysFromNow(1) })] })
      );
      expect(proposals, status).toHaveLength(1);
    }
    for (const status of ['draft', 'completed', 'cancelled'] as const) {
      const { proposals } = buildDonnyProposals(
        input({ campaigns: [campaign({ status, deadline: daysFromNow(1) })] })
      );
      expect(proposals, status).toEqual([]);
    }
  });

  it('renders nothing from campaigns when the query errored', () => {
    const { proposals } = buildDonnyProposals(input({ campaigns: undefined }));
    expect(proposals).toEqual([]);
  });
});

describe('buildDonnyProposals — the location-setup blocker', () => {
  const unready = {
    hasActiveLocation: true,
    isReady: false,
    locationName: 'Hoboken',
    missingSocial: true,
    missingStripe: false,
  };

  it('is returned separately from the capped list, so it can never be crowded out', () => {
    // It blocks campaign creation, promotions AND DragonShare. Ranked below
    // three pending applications it would vanish, which is a regression.
    const { blocker, proposals } = buildDonnyProposals(
      input({
        readiness: unready,
        pendingActions: [1, 2, 3, 4].map((n) => action({ campaignId: `c${n}` })),
      })
    );
    expect(blocker).not.toBeNull();
    expect(blocker!.id).toBe('signal:location_setup');
    expect(blocker!.dismissible).toBe(false);
    expect(proposals).toHaveLength(3);
    expect(proposals.every((p) => p.id !== 'signal:location_setup')).toBe(true);
  });

  it('names what is actually missing', () => {
    expect(buildDonnyProposals(input({ readiness: unready })).blocker!.text).toBe(
      'Hoboken needs at least one social media account before you can create campaigns, promotions, or use DragonShare'
    );
    expect(
      buildDonnyProposals(
        input({ readiness: { ...unready, missingSocial: false, missingStripe: true } })
      ).blocker!.text
    ).toBe(
      'Hoboken needs a connected Stripe account before you can create campaigns, promotions, or use DragonShare'
    );
    expect(
      buildDonnyProposals(input({ readiness: { ...unready, missingStripe: true } })).blocker!.text
    ).toBe(
      'Hoboken needs a connected Stripe account and at least one social media account before you can create campaigns, promotions, or use DragonShare'
    );
  });

  it('falls back to "This location" when the name is missing', () => {
    const { blocker } = buildDonnyProposals(
      input({ readiness: { ...unready, locationName: null } })
    );
    expect(blocker!.text).toMatch(/^This location needs/);
  });

  it('is absent when the location is ready or there is no active location', () => {
    expect(buildDonnyProposals(input()).blocker).toBeNull();
    expect(
      buildDonnyProposals(input({ readiness: { ...unready, hasActiveLocation: false } })).blocker
    ).toBeNull();
  });

  it('is not affected by the overflow count', () => {
    const { overflowCount } = buildDonnyProposals(
      input({ readiness: unready, pendingActions: [action()] })
    );
    expect(overflowCount).toBe(0);
  });
});

describe('buildDonnyProposals — CTA route validation', () => {
  it('every route CTA it emits is a real in-app route', async () => {
    const { isKnownDonnyRoute } = await import('@/lib/donnyRoutes');
    const { blocker, proposals } = buildDonnyProposals(
      input({
        pendingActions: [action(), action({ campaignId: 'c2', actionType: 'review_content' })],
        campaigns: [campaign({ deadline: daysFromNow(1) })],
        readiness: {
          hasActiveLocation: true,
          isReady: false,
          locationName: 'Hoboken',
          missingSocial: true,
          missingStripe: true,
        },
      })
    );
    for (const p of [blocker!, ...proposals]) {
      if (p.cta?.kind === 'route') {
        expect(isKnownDonnyRoute(p.cta.route), `${p.id} → ${p.cta.route}`).toBe(true);
      }
    }
  });

  it('drops the button rather than shipping a dead link', () => {
    // PR #409: twelve /settings/* CTAs shipped as 404s because nothing
    // validated a hardcoded route. A proposal whose route does not resolve
    // renders as text with no button.
    //
    // NOTE the id used here. An EMPTY campaignId does not work as a fixture:
    // it yields "/dashboard/business/campaigns/", and isKnownDonnyRoute strips
    // the trailing slash, so it normalizes to the real campaigns-list route and
    // validates TRUE. An id containing a slash is the case that actually fails.
    const { proposals } = buildDonnyProposals(
      input({ pendingActions: [action({ campaignId: 'a/b' })] })
    );
    expect(proposals[0].cta).toBeNull();
    expect(proposals[0].text).toContain('Ricky Ricardo applied');
  });
});
