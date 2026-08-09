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

/**
 * Local `now` at a given local hour/minute on NOW's local calendar day.
 * Timezone-independent: derives the day from NOW's OWN local date rather
 * than assuming a UTC offset.
 */
function localNowAt(hour: number, minute: number): number {
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** "YYYY-MM-DD" for the local calendar day `offset` days from `ms`. */
function localDateString(ms: number, offset: number): string {
  const d = new Date(ms);
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function action(over: Partial<PendingAction> = {}): PendingAction {
  return {
    sourceId: 'app1',
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

  it('gives two different applicants on the SAME campaign distinct ids, so dismissing one leaves the other visible', () => {
    // Two creators applying to the same campaign used to collide: the id was
    // `pending_action:${actionType}:${campaignId}` with no per-row component,
    // so "Ricky applied" and "Lucy applied" minted the SAME id. Multiple
    // applicants per campaign is the normal marketplace case, not an edge case.
    const { proposals } = buildDonnyProposals(
      input({
        pendingActions: [
          action({ sourceId: 'app-ricky', creatorName: 'Ricky Ricardo' }),
          action({ sourceId: 'app-lucy', creatorName: 'Lucy Ricardo' }),
        ],
      })
    );
    expect(proposals).toHaveLength(2);
    expect(proposals[0].id).not.toBe(proposals[1].id);

    // Dismissing Ricky's application must not silence Lucy's.
    const afterDismiss = buildDonnyProposals(
      input({
        pendingActions: [
          action({ sourceId: 'app-ricky', creatorName: 'Ricky Ricardo' }),
          action({ sourceId: 'app-lucy', creatorName: 'Lucy Ricardo' }),
        ],
        dismissedIds: [proposals[0].id],
      })
    );
    expect(afterDismiss.proposals).toHaveLength(1);
    expect(afterDismiss.proposals[0].id).toBe(proposals[1].id);
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
      'pending_action:review_application:c1:app1',
      'pending_action:review_application:c2:app1',
      'pending_action:review_application:c3:app1',
    ]);
  });

  it('promotes the next proposal when one is dismissed', () => {
    const { proposals, overflowCount } = buildDonnyProposals(
      input({ pendingActions: five, dismissedIds: ['pending_action:review_application:c1:app1'] })
    );
    expect(proposals.map((p) => p.id)).toEqual([
      'pending_action:review_application:c2:app1',
      'pending_action:review_application:c3:app1',
      'pending_action:review_application:c4:app1',
    ]);
    expect(overflowCount).toBe(1);
  });

  it('reports no overflow when nothing is hidden', () => {
    const { overflowCount } = buildDonnyProposals(input({ pendingActions: [action()] }));
    expect(overflowCount).toBe(0);
  });

  it('allProposalIds carries every ranked id, including those past the cap', () => {
    // The container's pass-1 localStorage read depends on this: reading only
    // the capped `proposals` ids would miss a dismissal on a proposal ranked
    // 4th+, and dismissing a higher-ranked one would resurrect it.
    const { proposals, allProposalIds } = buildDonnyProposals(input({ pendingActions: five }));
    expect(proposals).toHaveLength(3);
    expect(allProposalIds).toEqual([
      'pending_action:review_application:c1:app1',
      'pending_action:review_application:c2:app1',
      'pending_action:review_application:c3:app1',
      'pending_action:review_application:c4:app1',
      'pending_action:review_application:c5:app1',
    ]);
  });

  it('allProposalIds is unaffected by dismissedIds — it is the pre-filter set', () => {
    const { allProposalIds } = buildDonnyProposals(
      input({
        pendingActions: five,
        dismissedIds: [
          'pending_action:review_application:c1:app1',
          'pending_action:review_application:c4:app1',
        ],
      })
    );
    expect(allProposalIds).toHaveLength(5);
    expect(allProposalIds).toContain('pending_action:review_application:c1:app1');
    expect(allProposalIds).toContain('pending_action:review_application:c4:app1');
  });

  it('allProposalIds never includes the blocker — it is not dismissible', () => {
    const { allProposalIds } = buildDonnyProposals(
      input({
        readiness: {
          hasActiveLocation: true,
          isReady: false,
          locationName: 'Hoboken',
          missingSocial: true,
          missingStripe: false,
        },
        pendingActions: [action()],
      })
    );
    expect(allProposalIds).not.toContain('signal:location_setup');
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

describe('buildDonnyProposals — date-only deadlines (Postgres `date` column)', () => {
  // campaigns.deadline is a Postgres `date`, so Supabase returns "YYYY-MM-DD"
  // with no time component. new Date("YYYY-MM-DD") parses at UTC midnight — an
  // instant, not a calendar day — so instant-minus-instant is wrong in every
  // timezone: "today" reads as already-past once `now` is past UTC midnight,
  // and in a negative-UTC-offset zone (e.g. America/New_York, where the company
  // is based) a date-only deadline of tomorrow reads as "today" until ~8pm
  // local. These tests derive all expectations from LOCAL calendar-day
  // arithmetic so they hold regardless of which timezone they run in.

  it('is due today when `now` is late in the local day (the case that fails against instant-vs-instant math)', () => {
    const lateNow = localNowAt(23, 0);
    const todayDate = localDateString(lateNow, 0);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: todayDate })], now: lateNow })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].text).toBe('"Taco Tuesday" is due today');
  });

  it('is still due today when `now` is early in the local day', () => {
    const earlyNow = localNowAt(0, 30);
    const todayDate = localDateString(earlyNow, 0);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: todayDate })], now: earlyNow })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].text).toBe('"Taco Tuesday" is due today');
  });

  it('labels tomorrow\'s date "tomorrow", not "today", even late in the local day', () => {
    const lateNow = localNowAt(23, 0);
    const tomorrowDate = localDateString(lateNow, 1);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: tomorrowDate })], now: lateNow })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].text).toBe('"Taco Tuesday" is due tomorrow');
  });

  it('says "in 3 days" at the inclusive DEADLINE_SOON_DAYS boundary', () => {
    expect(DEADLINE_SOON_DAYS).toBe(3);
    const date = localDateString(NOW, DEADLINE_SOON_DAYS);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: date })], now: NOW })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].text).toBe('"Taco Tuesday" is due in 3 days');
  });

  it('is silent one day past the DEADLINE_SOON_DAYS boundary', () => {
    const date = localDateString(NOW, DEADLINE_SOON_DAYS + 1);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: date })], now: NOW })
    );
    expect(proposals).toEqual([]);
  });

  it('is silent for a deadline of yesterday (local)', () => {
    const date = localDateString(NOW, -1);
    const { proposals } = buildDonnyProposals(
      input({ campaigns: [campaign({ deadline: date })], now: NOW })
    );
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
