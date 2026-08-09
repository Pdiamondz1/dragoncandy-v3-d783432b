// Pure merge/rank/cap for the Donny-first dashboard body.
//
// Pure on purpose: it takes already-fetched query results plus an injected
// `now` and returns exactly what to render. No hooks, no network, no
// Date.now() — so the tests need no mocks and never flake on a clock.
//
// Relative time is NOT formatted here: formatRelativeTime() reads Date.now()
// internally, which would make this output non-deterministic. `occurredAt`
// rides alongside the text and the presentational component formats it.
import { isKnownDonnyRoute } from '@/lib/donnyRoutes';
import type { PendingAction } from '@/hooks/usePendingActions';
import type { ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';

/** How close a deadline has to be to be worth mentioning. A first guess — revisit against the §11 metrics rather than defending it. */
export const DEADLINE_SOON_DAYS = 3;

/** Never show more than this many proposals at once. Matches the banner cap it replaces. */
export const PROPOSAL_CAP = 3;

const MS_PER_DAY = 86_400_000;

export type ProposalCta =
  | { kind: 'route'; label: string; route: string }
  | { kind: 'ask'; label: string; message: string };

export interface DonnyProposal {
  /** `${kind}:${actionType}:${campaignId}` for actions, `signal:${key}` for signals. Stable across renders — it is the dismissal key. */
  id: string;
  kind: 'pending_action' | 'signal';
  /** Donny's voice, plain language, no timestamp. */
  text: string;
  /** ISO string when this happened, or null for signals. The component formats it. */
  occurredAt: string | null;
  /** null when the CTA's route failed validation: render the text, drop the button. */
  cta: ProposalCta | null;
  priority: number;
  dismissible: boolean;
}

export interface LocationReadinessInput {
  hasActiveLocation: boolean;
  isReady: boolean;
  locationName: string | null;
  missingSocial: boolean;
  missingStripe: boolean;
}

export interface DonnyProposalsInput {
  /** `undefined` means loading or errored — either way, nothing to show. */
  pendingActions: PendingAction[] | undefined;
  pendingActionsError: boolean;
  campaigns: ActiveCampaignItem[] | undefined;
  readiness: LocationReadinessInput;
  /** Proposal ids the user has already dismissed (localStorage + this session). */
  dismissedIds: string[];
  /** Injected so the deadline window is deterministic in tests. */
  now: number;
}

export interface DonnyProposalsResult {
  /** Cap-exempt, rendered above the list. Blocks campaign creation, promotions and DragonShare. */
  blocker: DonnyProposal | null;
  /** At most PROPOSAL_CAP, ranked. */
  proposals: DonnyProposal[];
  /** How many ranked proposals the cap hid. Never counts the blocker. */
  overflowCount: number;
}

/** localStorage key for a dismissed proposal. Deliberately NOT the old campaign-scoped `pendingBannerDismissed_` key. */
export function dismissalKey(proposalId: string): string {
  return `donnyProposalDismissed_${proposalId}`;
}

/** Route CTA, downgraded to null if the path is not real. */
function routeCta(label: string, route: string): ProposalCta | null {
  return isKnownDonnyRoute(route) ? { kind: 'route', label, route } : null;
}

function duePhrase(deadline: string, now: number): string | null {
  const days = Math.floor((new Date(deadline).getTime() - now) / MS_PER_DAY);
  if (days < 0 || days > DEADLINE_SOON_DAYS) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function pendingProposal(action: PendingAction): DonnyProposal {
  const who = action.creatorName?.trim() || 'A creator';
  const isApplication = action.actionType === 'review_application';
  const route = `/dashboard/business/campaigns/${action.campaignId}`;
  return {
    id: `pending_action:${action.actionType}:${action.campaignId}`,
    kind: 'pending_action',
    text: isApplication
      ? `${who} applied to "${action.campaignTitle}"`
      : `${who} submitted content for "${action.campaignTitle}"`,
    occurredAt: action.occurredAt,
    cta: routeCta(isApplication ? 'Review application' : 'Review content', route),
    priority: 0,
    dismissible: true,
  };
}

function deadlineProposals(
  campaigns: ActiveCampaignItem[],
  now: number
): DonnyProposal[] {
  // draft has nobody working on it; completed is done. Neither is a "needs you"
  // item. `cancelled` is already filtered out by useBusinessActiveCampaigns.
  const live = campaigns.filter((c) => c.status === 'published' || c.status === 'active');
  const out: DonnyProposal[] = [];
  for (const c of live) {
    if (!c.deadline) continue;
    const phrase = duePhrase(c.deadline, now);
    if (!phrase) continue;
    out.push({
      id: `signal:deadline:${c.id}`,
      kind: 'signal',
      text: `"${c.title}" is due ${phrase}`,
      occurredAt: null,
      cta: routeCta('Open campaign', `/dashboard/business/campaigns/${c.id}`),
      priority: 10,
      dismissible: false,
    });
  }
  return out;
}

function locationBlocker(readiness: LocationReadinessInput): DonnyProposal | null {
  if (!readiness.hasActiveLocation || readiness.isReady) return null;
  const parts: string[] = [];
  if (readiness.missingStripe) parts.push('a connected Stripe account');
  if (readiness.missingSocial) parts.push('at least one social media account');
  const needs = parts.join(' and ');
  const where = readiness.locationName?.trim() || 'This location';
  return {
    id: 'signal:location_setup',
    kind: 'signal',
    text: `${where} needs ${needs} before you can create campaigns, promotions, or use DragonShare`,
    occurredAt: null,
    cta: routeCta('Finish setup', '/dashboard/business/settings'),
    priority: -1,
    dismissible: false,
  };
}

export function buildDonnyProposals(input: DonnyProposalsInput): DonnyProposalsResult {
  const dismissed = new Set(input.dismissedIds);

  const pending = input.pendingActionsError ? [] : (input.pendingActions ?? []);
  const pendingProposals = pending
    .map(pendingProposal)
    // newest first
    .sort((a, b) => Date.parse(b.occurredAt ?? '') - Date.parse(a.occurredAt ?? ''));

  const signals = deadlineProposals(input.campaigns ?? [], input.now).sort(
    (a, b) => a.priority - b.priority
  );

  const ranked = [...pendingProposals, ...signals].filter((p) => !dismissed.has(p.id));

  return {
    blocker: locationBlocker(input.readiness),
    proposals: ranked.slice(0, PROPOSAL_CAP),
    overflowCount: Math.max(0, ranked.length - PROPOSAL_CAP),
  };
}
