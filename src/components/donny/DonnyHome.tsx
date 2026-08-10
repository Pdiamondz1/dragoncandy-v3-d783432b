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
// Phase B: the answer lands HERE, on the dashboard, instead of throwing the
// side panel open. Founder feedback after using Phase A on prod — "it opened
// the chat instead of keeping the conversation and details in the dashboard."
//
// How the design doc's §13 hazards were resolved, since it asked for each to be
// verified against code rather than assumed:
//  1/6. DonnyChatView is NOT reused — the thread was extracted into DonnyThread,
//       which renders no panel header (so no collapse()/close() inline, so no
//       second Donny) and owns no scroll container of its own. Each surface
//       supplies that: the panel is a fixed-height flex column, and here it is
//       DonnyThreadRegion, whose bounded scroller is what stops this page
//       growing a screen per exchange.
//  2/3/4/7. Dissolved rather than solved: there is no new `inline` stage. The
//       real blocker was that useDonny gates its queries on `stage !== 'closed'`,
//       which is about the PANEL being visible, not about the conversation being
//       live. registerInlineConversation separates those, so `stage` is
//       byte-unchanged and every consumer of it — nav button, desktop panel,
//       mobile sheet, tour anchors — behaves exactly as before. Nothing is
//       hidden, so no tour anchor is orphaned.
//  5. Unmount mid-stream keeps the documented contract: DonnyProvider sits above
//     the router, so the stream survives navigation and the reply persists. It
//     is now strictly better than before — deregistering drops the count to 0
//     but `stage` is untouched, so if the panel happens to be open the query
//     stays enabled, and on return the thread refetches.
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDonnyHomeConversation } from '@/hooks/donny/useDonnyHomeConversation';
import { useDonnyHomeInteractions } from '@/hooks/donny/useDonnyHomeInteractions';
import { useTour } from '@/hooks/useTour';
import { usePendingActions } from '@/hooks/usePendingActions';
import { useUpcomingCampaignDeadlines } from '@/hooks/useUpcomingCampaignDeadlines';
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
import { LocationBadge } from '@/components/org/LocationBadge';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { DonnyHomeShell } from './DonnyHomeShell';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';
import { buildDonnyProposals } from '@/lib/donny/buildDonnyProposals';

const OVERVIEW_ROUTE = '/dashboard/business/overview';

export function DonnyHome() {
  const { profile, activeOrgUnit } = useAuth();
  const conversation = useDonnyHomeConversation();
  const { ask } = conversation;
  const tour = useTour();

  const pending = usePendingActions();
  // Deliberately NOT useBusinessActiveCampaigns: that hook is capped at the 5
  // most recently CREATED campaigns for the recent-activity list it was built
  // for (BusinessOverview.tsx still uses it for exactly that). This screen
  // needs the campaigns due SOONEST, not created most recently — with more
  // than 5 non-cancelled campaigns, an older one due tomorrow would silently
  // vanish from "Needs your attention" if it fed off the recency query.
  const campaigns = useUpcomingCampaignDeadlines(activeOrgUnit?.id);
  const readiness = useLocationReadiness();

  const isLoading = pending.isLoading || campaigns.isLoading;

  // useLocationReadiness returns a fresh object literal every render, so
  // depending on it directly would defeat the memo. Depend on its primitives.
  const { hasActiveLocation, isReady, locationName, missingSocial, missingStripe } = readiness;

  const base = React.useMemo(
    () => ({
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
    }),
    [
      pending.data,
      pending.isError,
      campaigns.data,
      hasActiveLocation,
      isReady,
      locationName,
      missingSocial,
      missingStripe,
    ]
  );

  const {
    result,
    handleProposalTap,
    handleDismiss,
    handleSuggestionTap,
    handlePromptSubmit,
    trackOverviewOpen,
  } = useDonnyHomeInteractions({
    build: buildDonnyProposals,
    base,
    ask,
    isLoading,
    role: profile?.role,
  });

  return (
    <DonnyHomeShell
      userRole="business_client"
      roleLabel="Restaurant Dashboard"
      greetingName={profile?.full_name || 'there'}
      subtitle="Tell me what you need and I'll take it from here."
      badge={<LocationBadge />}
      overviewRoute={OVERVIEW_ROUTE}
      onOverviewOpen={trackOverviewOpen}
      suggestions={BUSINESS_SUGGESTIONS}
      onSubmit={handlePromptSubmit}
      onSuggestionTap={handleSuggestionTap}
      profileLoaded={!!profile}
      conversation={conversation}
      tour={tour}
    >
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
    </DonnyHomeShell>
  );
}
