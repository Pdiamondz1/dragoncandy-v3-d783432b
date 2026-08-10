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
//       second Donny) and owns no scroll container or h-full (so it composes in
//       normal page flow inside #main-content).
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
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';
import { useTour } from '@/hooks/useTour';
import { usePendingActions } from '@/hooks/usePendingActions';
import { useUpcomingCampaignDeadlines } from '@/hooks/useUpcomingCampaignDeadlines';
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageBody } from '@/components/app/PageBody';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { LocationBadge } from '@/components/org/LocationBadge';
import { DonnyAvatar } from './DonnyAvatar';
import { DCTour } from '@/components/guidance/DCTour';
import { TourButton } from '@/components/guidance/TourButton';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { DonnyHomePrompt } from './DonnyHomePrompt';
import { DonnyThread } from './DonnyThread';
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
  const {
    registerInlineConversation,
    messages,
    avatarState,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    retry,
    userRole,
  } = useDonnyContext();

  // Keep the conversation live while this page is mounted — without it the
  // messages query is disabled whenever the panel is closed, which is the
  // normal state here, and the thread below would render permanently empty.
  React.useEffect(() => registerInlineConversation(), [registerInlineConversation]);

  const hasConversation = messages.length > 0 || isStreaming;

  const threadEndRef = React.useRef<HTMLDivElement>(null);
  // Auto-scroll follows the reply ONLY after the user has asked something on
  // this page. It deliberately does not fire on arrival: this is a dashboard,
  // and someone returning to it with yesterday's thread should land on the
  // greeting and the attention list, not be thrown to the bottom of an old
  // conversation. (The panel scrolls on mount because it IS a chat surface.)
  //
  // The obvious heuristic — "the message count grew" — is wrong here, and was
  // the first version of this code. On arrival the count grows from 0 to N as
  // the query resolves, which is indistinguishable from a new reply, so
  // returning to the page scrolled past the greeting anyway. Worse, it depended
  // on React Query's cache: with the thread already cached the count never
  // grew and it behaved correctly, so it would have looked right about half the
  // time. Asking is something the user DOES — record it, don't infer it.
  const userAskedHere = React.useRef(false);

  React.useEffect(() => {
    if (!userAskedHere.current) return;
    // scrollIntoView, not a scrollTop write: the app's scroller is
    // #main-content, never the window (window.scrollY is always 0 here), and
    // letting the browser find the scrollable ancestor avoids hard-coding that.
    threadEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, isStreaming, streamingContent]);

  // Every path that sends from this page goes through here, so the scroll
  // intent is recorded in exactly one place and cannot drift between the
  // prompt box, the taps and the attention list.
  const ask = React.useCallback(
    (text: string) => {
      userAskedHere.current = true;
      sendMessage(text);
    },
    [sendMessage]
  );
  const { trackEvent } = useAnalyticsContext();
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();

  const pending = usePendingActions();
  // Deliberately NOT useBusinessActiveCampaigns: that hook is capped at the 5
  // most recently CREATED campaigns for the recent-activity list it was built
  // for (BusinessOverview.tsx still uses it for exactly that). This screen
  // needs the campaigns due SOONEST, not created most recently — with more
  // than 5 non-cancelled campaigns, an older one due tomorrow would silently
  // vanish from "Needs your attention" if it fed off the recency query.
  const campaigns = useUpcomingCampaignDeadlines(activeOrgUnit?.id);
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
      // Inline too — an attention-list tap that threw the panel open while the
      // prompt box answered in place would be two behaviours for one page.
      ask(proposal.cta.message);
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
    ask(suggestion.message);
  };

  const handlePromptSubmit = (text: string) => {
    void trackEvent('donny_home_prompt_submitted', {});
    ask(text);
  };

  if (!profile) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          {/* Mirrors the loaded hero's width and centring so there is no
              layout jump when the profile resolves. */}
          <PageBody maxWidth="4xl">
            <div className="flex flex-col items-center gap-3 pt-4 lg:pt-12">
              <DCSkeleton variant="text-block" className="h-16 w-16 rounded-full" />
              <DCSkeleton variant="text-block" className="h-8 w-64" />
              <DCSkeleton variant="text-block" className="h-3 w-72" />
            </div>
            <DCSkeleton variant="text-block" className="h-16 w-full rounded-full" />
            <DCSkeleton variant="list-row" count={3} />
          </PageBody>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageBody maxWidth="4xl">
          {/* A centered hero, not a heading with a field under it: on this
              dashboard the prompt IS the body, so it gets the emblem, the
              greeting and the whitespace rather than sharing them with a
              stat grid. Deliberately NOT DashboardGreeting — that component
              is left-aligned and shared with the creator/brand dashboards,
              which keep their current layout. No tour anchor lives in it, so
              swapping it here costs nothing. */}
          <div className="flex flex-col items-center pt-4 text-center lg:pt-12">
            <div className="flex items-center gap-2 pb-7">
              <span className="text-xs font-semibold uppercase tracking-widest text-dc-text-muted">
                Restaurant Dashboard
              </span>
              <LocationBadge />
            </div>
            <DonnyAvatar size="xl" aria-label="Donny" />
            <h1 className="pt-5 text-3xl font-bold text-dc-text lg:text-4xl">
              Welcome back, {profile?.full_name || 'there'}
            </h1>
            <p className="pt-2 text-base text-dc-text-muted">
              Tell me what you need and I'll take it from here.
            </p>
          </div>

          <DonnyHomePrompt
            suggestions={BUSINESS_SUGGESTIONS}
            onSubmit={handlePromptSubmit}
            onSuggestionTap={handleSuggestionTap}
          />

          {/* The conversation, in the page — not in a panel over it. Rendered
              only once there is something to show, so a first visit still opens
              on the greeting and the attention list rather than an empty well.
              No fixed height and no inner scroller: the page scrolls, which is
              what makes a long answer readable here instead of trapped in a
              200px box. */}
          {hasConversation && (
            <div
              className="space-y-3 rounded-2xl border border-dc-teal/15 bg-dc-teal/[0.04] p-4"
              role="log"
              aria-label="Donny conversation"
              aria-live="polite"
            >
              <DonnyThread
                messages={messages}
                avatarState={avatarState}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                error={error}
                retry={retry}
                userRole={userRole}
              />
              <div ref={threadEndRef} />
            </div>
          )}

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
