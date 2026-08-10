// The role-generic half of a Donny-first dashboard container: dismissal state,
// the two-pass proposal build, view tracking, and the four handlers the shell
// and the proposal list call back into.
//
// Extracted because none of it is role-specific. What a role genuinely owns is
// its data hooks, its builder, and its copy — all of which stay in the
// container. Before this, both containers carried byte-identical copies of the
// mechanism below, and nothing would have caught the two drifting apart.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';
import {
  readDismissedProposalIds,
  writeDismissedProposalId,
} from '@/lib/donny/proposalDismissal';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

interface DonnyHomeInteractionsParams<TBase extends object> {
  /** The role's pure proposal builder — a module-level function, so stable. */
  build: (input: TBase & { dismissedIds: string[] }) => DonnyProposalsResult;
  /**
   * The role's builder input WITHOUT `dismissedIds`.
   *
   * Must be referentially stable: memoise it in the container against its own
   * primitives. Passing a fresh object literal every render defeats the memo
   * below, which is what keeps a captured `now` frozen and keeps `result`'s
   * identity steady for the view-tracking effect.
   */
  base: TBase;
  /** Ask Donny inline — the conversation's own `ask`, not the panel's. */
  ask: (text: string) => void;
  /** Suppresses the view event until the data behind the count has arrived. */
  isLoading: boolean;
  /** Reported with the view event; not used for any branching. */
  role: string | undefined;
}

export interface DonnyHomeInteractions {
  result: DonnyProposalsResult;
  handleProposalTap: (proposal: DonnyProposal) => void;
  handleDismiss: (proposalId: string) => void;
  handleSuggestionTap: (suggestion: DonnySuggestion) => void;
  handlePromptSubmit: (text: string) => void;
  trackOverviewOpen: () => void;
}

export function useDonnyHomeInteractions<TBase extends object>({
  build,
  base,
  ask,
  isLoading,
  role,
}: DonnyHomeInteractionsParams<TBase>): DonnyHomeInteractions {
  const navigate = useNavigate();
  const { trackEvent } = useAnalyticsContext();

  const [sessionDismissed, setSessionDismissed] = React.useState<string[]>([]);

  const result = React.useMemo(() => {
    // Pass 1 must read the FULL ranked set (allProposalIds), not the capped
    // `proposals` list: reading only the capped ids would miss a live
    // dismissal on a proposal ranked below PROPOSAL_CAP, and dismissing a
    // higher-ranked proposal would then resurrect it (promoted into the now
    // shorter capped view without ever having its dismissal checked).
    const candidates = build({ ...base, dismissedIds: [] });
    const stored = readDismissedProposalIds(candidates.allProposalIds);
    return build({ ...base, dismissedIds: [...stored, ...sessionDismissed] });
  }, [build, base, sessionDismissed]);

  const viewRecorded = React.useRef(false);
  React.useEffect(() => {
    if (viewRecorded.current || isLoading) return;
    viewRecorded.current = true;
    void trackEvent('donny_home_viewed', {
      role: role ?? 'unknown',
      proposal_count: result.proposals.length,
      has_pending: result.proposals.some((p) => p.kind === 'pending_action'),
    });
  }, [isLoading, result.proposals, role, trackEvent]);

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

  const trackOverviewOpen = () => void trackEvent('donny_home_overview_opened', {});

  return {
    result,
    handleProposalTap,
    handleDismiss,
    handleSuggestionTap,
    handlePromptSubmit,
    trackOverviewOpen,
  };
}
