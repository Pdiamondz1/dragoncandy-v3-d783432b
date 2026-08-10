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
import { useAuth } from '@/hooks/useAuth';
import { useDonnyHomeConversation } from '@/hooks/donny/useDonnyHomeConversation';
import { useDonnyHomeInteractions } from '@/hooks/donny/useDonnyHomeInteractions';
import { useTour } from '@/hooks/useTour';
import { useCreatorAttentionInvitations } from '@/hooks/useCreatorAttentionInvitations';
import { useCreatorContentTodo } from '@/hooks/useCreatorContentTodo';
import { useCreatorPendingApplications } from '@/hooks/useCreatorPendingApplications';
import { useCreatorPayoutState } from '@/hooks/useCreatorPayoutState';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { DonnyHomeShell } from './DonnyHomeShell';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import { CREATOR_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';
import { buildCreatorProposals } from '@/lib/donny/buildCreatorProposals';

const OVERVIEW_ROUTE = '/dashboard/creator/overview';

export function CreatorDonnyHome() {
  const { profile } = useAuth();
  const conversation = useDonnyHomeConversation();
  const { ask } = conversation;
  const tour = useTour();

  const invitations = useCreatorAttentionInvitations();
  const contentTodo = useCreatorContentTodo();
  const applications = useCreatorPendingApplications();
  const payout = useCreatorPayoutState();

  const isLoading =
    invitations.isLoading || contentTodo.isLoading || applications.isLoading || payout.isLoading;

  const base = React.useMemo(
    () => ({
      invitations: invitations.data,
      invitationsError: invitations.isError,
      contentTodo: contentTodo.data,
      contentTodoError: contentTodo.isError,
      applications: applications.data,
      applicationsError: applications.isError,
      payout: payout.data,
      payoutError: payout.isError,
    }),
    [
      invitations.data,
      invitations.isError,
      contentTodo.data,
      contentTodo.isError,
      applications.data,
      applications.isError,
      payout.data,
      payout.isError,
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
    build: buildCreatorProposals,
    base,
    ask,
    isLoading,
    role: profile?.role,
  });

  return (
    <DonnyHomeShell
      userRole="content_creator"
      roleLabel="Creator Dashboard"
      greetingName={profile?.creator_name || profile?.full_name || 'there'}
      subtitle="Tell me what you need and I'll take it from here."
      overviewRoute={OVERVIEW_ROUTE}
      onOverviewOpen={trackOverviewOpen}
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
