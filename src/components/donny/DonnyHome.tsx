// The Donny-first business dashboard body.
//
// A container: it mounts the data hooks, owns dismissal state, and hands
// already-fetched results to the pure buildDonnyProposals(). The two children
// below it are presentational.
//
// Cost note: these are the SAME React Query keys the replaced body used, so
// there is no net new load versus today — but this component now owns them
// rather than inheriting them for free.
//
// Phase A opens the EXISTING Donny panel. Inline chat is Phase B; see the
// design doc §13 for the seven hazards it has to resolve first.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';
import { useTour } from '@/hooks/useTour';
import { usePendingActions } from '@/hooks/usePendingActions';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { LocationBadge } from '@/components/org/LocationBadge';
import { DCTour } from '@/components/guidance/DCTour';
import { TourButton } from '@/components/guidance/TourButton';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { BUSINESS_SUGGESTIONS, type DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';
import { buildDonnyProposals, type DonnyProposal } from '@/lib/donny/buildDonnyProposals';
import {
  readDismissedProposalIds,
  writeDismissedProposalId,
} from '@/lib/donny/proposalDismissal';

const OVERVIEW_ROUTE = '/dashboard/business/overview';

export function DonnyHome() {
  const { profile, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { openDonnyWithContext } = useDonnyContext();
  const { trackEvent } = useAnalyticsContext();
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();

  const pending = usePendingActions();
  const campaigns = useBusinessActiveCampaigns(activeOrgUnit?.id);
  const readiness = useLocationReadiness();

  const [sessionDismissed, setSessionDismissed] = React.useState<string[]>([]);

  const isLoading = pending.isLoading || campaigns.isLoading;

  // Two passes: build once to learn the candidate ids, read localStorage for
  // just those, then build again with the dismissals applied. Cheap — the
  // function is pure and the lists are capped at 5 rows each.
  // useLocationReadiness returns a fresh object literal every render, so
  // depending on it directly would defeat the memo. Depend on its primitives.
  const { hasActiveLocation, isReady, locationName, missingSocial, missingStripe } = readiness;

  const result = React.useMemo(() => {
    const base = {
      pendingActions: pending.data,
      pendingActionsError: pending.isError,
      campaigns: campaigns.data,
      readiness: { hasActiveLocation, isReady, locationName, missingSocial, missingStripe },
      // Captured once, when this memo (re)computes — not on every render, and
      // NOT on every refetch either: React Query's structural sharing means a
      // refetch that returns identical rows keeps the same `data` reference,
      // so it does not retrigger this memo. `now` is effectively frozen for
      // the life of an open tab unless the underlying data actually changes.
      // A deadline crossing the 3-day threshold in a long-lived open tab will
      // not surface until then (e.g. on navigation, which remounts). No
      // interval or focus listener is added on purpose — the blast radius of
      // a stale `now` here is small and it self-heals on the next navigation.
      now: Date.now(),
    };
    // Pass 1 must read the FULL ranked set (allProposalIds), not the capped
    // `proposals` list: reading only the capped ids would miss a live
    // dismissal on a proposal ranked below PROPOSAL_CAP, and dismissing a
    // higher-ranked proposal would then resurrect it (promoted into the now
    // shorter capped view without ever having its dismissal checked).
    const candidates = buildDonnyProposals({ ...base, dismissedIds: [] });
    const stored = readDismissedProposalIds(candidates.allProposalIds);
    return buildDonnyProposals({
      ...base,
      dismissedIds: [...stored, ...sessionDismissed],
    });
  }, [
    pending.data,
    pending.isError,
    campaigns.data,
    hasActiveLocation,
    isReady,
    locationName,
    missingSocial,
    missingStripe,
    sessionDismissed,
  ]);

  const viewRecorded = React.useRef(false);
  React.useEffect(() => {
    if (viewRecorded.current || isLoading) return;
    viewRecorded.current = true;
    void trackEvent('donny_home_viewed', {
      role: profile?.role ?? 'unknown',
      proposal_count: result.proposals.length,
      has_pending: result.proposals.some((p) => p.kind === 'pending_action'),
    });
  }, [isLoading, result.proposals, profile?.role, trackEvent]);

  const handleProposalTap = (proposal: DonnyProposal) => {
    if (!proposal.cta) return;
    void trackEvent('donny_home_proposal_tapped', {
      proposal_kind: proposal.kind,
      cta_kind: proposal.cta.kind,
    });
    if (proposal.cta.kind === 'route') {
      navigate(proposal.cta.route);
    } else {
      openDonnyWithContext(proposal.cta.message);
    }
  };

  const handleDismiss = (proposalId: string) => {
    const proposal = result.proposals.find((p) => p.id === proposalId);
    writeDismissedProposalId(proposalId);
    setSessionDismissed((prev) => (prev.includes(proposalId) ? prev : [...prev, proposalId]));
    void trackEvent('donny_home_proposal_dismissed', {
      proposal_kind: proposal?.kind ?? 'unknown',
    });
  };

  const handleSuggestionTap = (suggestion: DonnySuggestion) => {
    void trackEvent('donny_home_suggestion_tapped', { label: suggestion.label });
    openDonnyWithContext(suggestion.message);
  };

  const handlePromptSubmit = (text: string) => {
    void trackEvent('donny_home_prompt_submitted', {});
    openDonnyWithContext(text);
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageBody>
          <DashboardGreeting
            roleLabel="Restaurant Dashboard"
            userName={profile?.full_name || 'there'}
            badge={<LocationBadge />}
            subtitle="Tell me what you need and I'll take it from here."
          />

          <DonnyHomePrompt
            suggestions={BUSINESS_SUGGESTIONS}
            onSubmit={handlePromptSubmit}
            onSuggestionTap={handleSuggestionTap}
          />

          {/* The rating prompts go INSIDE the attention frame, not beside it.
              `NeedsAttentionSection` exists to consolidate every "needs you"
              banner into ONE quiet framed list — the replaced body put all four
              in a single instance. Rendering these as siblings would produce one
              framed list plus two orphaned rows under it. */}
          <DonnyHomeProposals
            result={result}
            isLoading={isLoading}
            onDismiss={handleDismiss}
            onTap={handleProposalTap}
          >
            {/* Kept from the replaced body: these have no other home for this role. */}
            <RatingPromptManager variant="row" />
            <SponsorshipRatingPromptManager variant="row" />
          </DonnyHomeProposals>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Link
              to={OVERVIEW_ROUTE}
              onClick={() => void trackEvent('donny_home_overview_opened', {})}
              className="text-sm font-semibold text-dc-teal-btn hover:underline"
            >
              View full dashboard →
            </Link>
            <TourButton onClick={triggerTour} />
          </div>
        </PageBody>
        {showTour && tourSteps.length > 0 && (
          <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
        )}
      </div>
    </DashboardLayout>
  );
}
