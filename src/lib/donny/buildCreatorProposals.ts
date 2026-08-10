// Pure merge/rank/cap for the creator half of the Donny-first dashboard.
//
// Sibling to buildDonnyProposals.ts (the business builder): same job, same
// output contract (DonnyProposalsResult), so DonnyHomeProposals renders
// either role's result unchanged. Pure on purpose: it takes already-fetched
// query results plus an injected `now` and returns exactly what to render —
// no hooks, no network, no Date.now().
//
// Unlike the business builder, this does NOT sort a merged list by priority
// across kinds — the ranking is a fixed, explicit ordering of item types
// (spec §4.4), because which type leads depends on whether money or work is
// in flight. See `hasMoneyOrWork` below.
import { routeCta, PROPOSAL_CAP, type DonnyProposal, type DonnyProposalsResult } from './buildDonnyProposals';
import type { CreatorInvitation } from '@/hooks/useCreatorAttentionInvitations';
import type { CreatorContentTodo } from '@/hooks/useCreatorContentTodo';
import type { CreatorPendingApplication } from '@/hooks/useCreatorPendingApplications';
import type { CreatorPayoutState } from '@/hooks/useCreatorPayoutState';

export type { DonnyProposalsResult };

export interface CreatorProposalsInput {
  /** `undefined` means loading or errored — either way, nothing to show. */
  invitations: CreatorInvitation[] | undefined;
  invitationsError: boolean;
  contentTodo: CreatorContentTodo[] | undefined;
  contentTodoError: boolean;
  applications: CreatorPendingApplication[] | undefined;
  applicationsError: boolean;
  payout: CreatorPayoutState | undefined;
  payoutError: boolean;
  /** Proposal ids the user has already dismissed (localStorage + this session). */
  dismissedIds: string[];
  /** Injected so ordering is deterministic in tests. Unused today — no item in
   *  this builder reads a deadline window — but kept for parity with the
   *  business builder's signature and in case a future item needs it. */
  now: number;
}

/**
 * Whole-dollar formatter. `creator_profiles.pending_balance` is `numeric` in
 * dollars, not cents (verified on prod — the live row holds `360`).
 */
function formatMoney(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
}

/** Newest first, by ISO `occurredAt`. Only ever called on arrays whose items
 *  all carry a real timestamp (A, B, D) — C and E always carry `null` and are
 *  never sorted, so no null ever reaches this comparator. */
function newestFirst(proposals: DonnyProposal[]): DonnyProposal[] {
  return [...proposals].sort((a, b) => Date.parse(b.occurredAt ?? '') - Date.parse(a.occurredAt ?? ''));
}

/** Item A — a collaboration whose content has not been started. */
function contentTodoProposals(items: CreatorContentTodo[]): DonnyProposal[] {
  return newestFirst(
    items.map((item) => ({
      id: `creator:content_todo:${item.collaborationId}`,
      kind: 'pending_action',
      text: `You haven't started content for "${item.campaignTitle}" yet`,
      occurredAt: item.createdAt,
      cta: routeCta('Start content', `/dashboard/creator/my-campaigns/${item.campaignId}`),
      priority: 0,
      dismissible: true,
    }))
  );
}

/** Item B — an application still awaiting a business decision. */
function applicationProposals(items: CreatorPendingApplication[]): DonnyProposal[] {
  return newestFirst(
    items.map((item) => ({
      id: `creator:application:${item.applicationId}`,
      kind: 'pending_action',
      text: `Still waiting to hear back on "${item.campaignTitle}"`,
      occurredAt: item.createdAt,
      cta: routeCta('View application', '/dashboard/creator/my-campaigns?tab=applied'),
      priority: 0,
      dismissible: true,
    }))
  );
}

/**
 * Item D — a pending invitation to a still-open campaign. One row per
 * invitation, never an aggregate: the id and the CTA are both per-campaign,
 * and a creator with several invitations dismisses them one at a time.
 *
 * Deliberately a nudge, never an assignment (#382): no "selected", no
 * "accept", no implied priority — the campaign is already public.
 */
function invitationProposals(items: CreatorInvitation[]): DonnyProposal[] {
  return newestFirst(
    items.map((item) => ({
      id: `creator:invitation:${item.campaignId}`,
      kind: 'pending_action',
      text: `${item.businessName} asked you to apply to "${item.campaignTitle}"`,
      occurredAt: item.createdAt,
      cta: routeCta('View campaign', `/dashboard/creator/campaigns/${item.campaignId}`),
      priority: 0,
      dismissible: true,
    }))
  );
}

/**
 * Item C — payout readiness. Four states, in order. The fourth is silent on
 * purpose: `stripe_onboarding_complete` is known to go stale-false (#173, the
 * webhook never delivers), and the only real verifier calls the Stripe API
 * from the backend — the frontend cannot tell "hasn't finished" from
 * "finished, we never heard". Telling someone who is already set up to go set
 * up is the #357 false-"verify your email" class, on the top item of the page.
 */
function payoutProposals(payout: CreatorPayoutState): DonnyProposal[] {
  if (payout.onboardingComplete) return [];

  if (payout.pendingBalance > 0) {
    return [
      {
        id: 'creator:payout',
        kind: 'signal',
        text: `You have ${formatMoney(payout.pendingBalance)} waiting — check your payout setup`,
        occurredAt: null,
        cta: routeCta('Check payout setup', '/dashboard/creator/earnings'),
        priority: 0,
        dismissible: false,
      },
    ];
  }

  if (!payout.hasStripeAccount) {
    return [
      {
        id: 'creator:payout',
        kind: 'signal',
        text: 'Set up payouts so you can get paid',
        occurredAt: null,
        cta: routeCta('Set up payouts', '/dashboard/creator/earnings'),
        priority: 0,
        dismissible: false,
      },
    ];
  }

  // Ambiguous: account set, flag false, no balance. Unknowable from the
  // client, and no urgency to justify a guess — stay silent.
  return [];
}

/**
 * Item E — nothing in flight. Takes no query and names no count: derived
 * purely from the absence of A, B, D and any collaboration, so it adds no
 * fifth read.
 */
function findWorkProposal(hasNothingInFlight: boolean): DonnyProposal[] {
  if (!hasNothingInFlight) return [];
  return [
    {
      id: 'creator:find_work',
      kind: 'signal',
      text: 'Nothing on your plate — find your next campaign',
      occurredAt: null,
      cta: routeCta('Find campaigns', '/dashboard/creator/campaigns'),
      priority: 0,
      dismissible: false,
    },
  ];
}

export function buildCreatorProposals(input: CreatorProposalsInput): DonnyProposalsResult {
  const dismissed = new Set(input.dismissedIds);

  const contentTodo = input.contentTodoError ? [] : (input.contentTodo ?? []);
  const applications = input.applicationsError ? [] : (input.applications ?? []);
  const invitations = input.invitationsError ? [] : (input.invitations ?? []);
  const payout = input.payoutError ? undefined : input.payout;

  const contentProposals = contentTodoProposals(contentTodo);
  const applicationProps = applicationProposals(applications);
  const invitationProps = invitationProposals(invitations);

  const collaborationCount = payout?.collaborationCount ?? 0;
  const pendingBalance = payout?.pendingBalance ?? 0;
  const hasMoneyOrWork = pendingBalance > 0 || collaborationCount > 0;

  const payoutProps = payout ? payoutProposals(payout) : [];

  const nothingInFlight =
    contentProposals.length === 0 &&
    applicationProps.length === 0 &&
    invitationProps.length === 0 &&
    collaborationCount === 0;
  const findWorkProps = findWorkProposal(nothingInFlight);

  const merged = hasMoneyOrWork
    ? [...payoutProps, ...contentProposals, ...applicationProps, ...invitationProps]
    : [...contentProposals, ...applicationProps, ...invitationProps, ...findWorkProps, ...payoutProps];

  const ranked = merged.filter((p) => !dismissed.has(p.id));

  return {
    // Nothing in the creator flow is blocked the way an unready business
    // location blocks campaign creation — an unpaid creator can still
    // browse, apply and deliver. Item C is a ranked proposal, not a blocker.
    blocker: null,
    proposals: ranked.slice(0, PROPOSAL_CAP),
    overflowCount: Math.max(0, ranked.length - PROPOSAL_CAP),
    allProposalIds: merged.map((p) => p.id),
  };
}
