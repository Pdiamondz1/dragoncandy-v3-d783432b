// The Donny-first creator dashboard body.
//
// A container: it mounts the data hooks, owns dismissal state, and hands
// already-fetched results to the pure buildCreatorProposals(). The two
// children below it are presentational. Mirrors DonnyHome.tsx (the business
// container) — see that file for the fuller history/rationale comments on
// the shared shell/thread/dismissal mechanics; this file only carries what
// differs for the creator role.
//
// No `badge` — LocationBadge is org-scoped and creators have no org.
// No SponsorshipRatingPromptManager — that is a business concern.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDonnyHomeConversation } from '@/hooks/donny/useDonnyHomeConversation';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';
import { useTour } from '@/hooks/useTour';
import { useCreatorAttentionInvitations } from '@/hooks/useCreatorAttentionInvitations';
import { useCreatorContentTodo } from '@/hooks/useCreatorContentTodo';
import { useCreatorPendingApplications } from '@/hooks/useCreatorPendingApplications';
import { useCreatorPayoutState } from '@/hooks/useCreatorPayoutState';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { DonnyHomeShell } from './DonnyHomeShell';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { CREATOR_SUGGESTIONS, type DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';
import { buildCreatorProposals } from '@/lib/donny/buildCreatorProposals';
import type { DonnyProposal } from '@/lib/donny/buildDonnyProposals';
import {
  readDismissedProposalIds,
  writeDismissedProposalId,
} from '@/lib/donny/proposalDismissal';

const OVERVIEW_ROUTE = '/dashboard/creator/overview';

export function CreatorDonnyHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const conversation = useDonnyHomeConversation();
  const { ask } = conversation;
  const { trackEvent } = useAnalyticsContext();
  const tour = useTour();

  const invitations = useCreatorAttentionInvitations();
  const contentTodo = useCreatorContentTodo();
  const applications = useCreatorPendingApplications();
  const payout = useCreatorPayoutState();

  const [sessionDismissed, setSessionDismissed] = React.useState<string[]>([]);

  const isLoading =
    invitations.isLoading || contentTodo.isLoading || applications.isLoading || payout.isLoading;

  // Two passes: build once to learn the candidate ids, read localStorage for
  // just those, then build again with the dismissals applied. Cheap — the
  // function is pure and the lists are capped at 5 rows each.
  const result = React.useMemo(() => {
    const base = {
      invitations: invitations.data,
      invitationsError: invitations.isError,
      contentTodo: contentTodo.data,
      contentTodoError: contentTodo.isError,
      applications: applications.data,
      applicationsError: applications.isError,
      payout: payout.data,
      payoutError: payout.isError,
      now: Date.now(),
    };
    // Pass 1 must read the FULL ranked set (allProposalIds), not the capped
    // `proposals` list: reading only the capped ids would miss a live
    // dismissal on a proposal ranked below PROPOSAL_CAP, and dismissing a
    // higher-ranked proposal would then resurrect it (promoted into the now
    // shorter capped view without ever having its dismissal checked).
    const candidates = buildCreatorProposals({ ...base, dismissedIds: [] });
    const stored = readDismissedProposalIds(candidates.allProposalIds);
    return buildCreatorProposals({
      ...base,
      dismissedIds: [...stored, ...sessionDismissed],
    });
  }, [
    invitations.data,
    invitations.isError,
    contentTodo.data,
    contentTodo.isError,
    applications.data,
    applications.isError,
    payout.data,
    payout.isError,
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

  return (
    <DonnyHomeShell
      userRole="content_creator"
      roleLabel="Creator Dashboard"
      greetingName={profile?.creator_name || profile?.full_name || 'there'}
      subtitle="Tell me what you need and I'll take it from here."
      overviewRoute={OVERVIEW_ROUTE}
      onOverviewOpen={() => void trackEvent('donny_home_overview_opened', {})}
      suggestions={CREATOR_SUGGESTIONS}
      onSubmit={handlePromptSubmit}
      onSuggestionTap={handleSuggestionTap}
      profileLoaded={!!profile}
      tourAnchors={{ prompt: 'browse-campaigns', overview: 'creator-secondary' }}
      conversation={conversation}
      tour={tour}
    >
      <div data-tour="creator-attention">
        <DonnyHomeProposals
          result={result}
          isLoading={isLoading}
          onDismiss={handleDismiss}
          onTap={handleProposalTap}
        >
          <RatingPromptManager variant="row" />
        </DonnyHomeProposals>
      </div>
    </DonnyHomeShell>
  );
}
