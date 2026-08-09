// Presentational half of the Donny-first dashboard body: what needs the owner's
// attention right now. Every input is a prop and every action is a callback —
// the container owns the data, the navigation and the analytics.
import type { ReactNode } from 'react';
import { AlertTriangle, Clock, Eye, X } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { NeedsAttentionSection } from '@/components/dashboard/NeedsAttentionSection';
import { formatRelativeTime } from '@/lib/campaignUtils';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';

interface DonnyHomeProposalsProps {
  result: DonnyProposalsResult;
  isLoading: boolean;
  onDismiss: (proposalId: string) => void;
  onTap: (proposal: DonnyProposal) => void;
  /** Extra "needs you" rows appended as trailing slots INSIDE the same frame. */
  children?: ReactNode;
}

function ProposalIcon({ proposal }: { proposal: DonnyProposal }) {
  if (proposal.id === 'signal:location_setup') {
    return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />;
  }
  if (proposal.id.startsWith('pending_action:review_content')) {
    return <Eye className="h-4 w-4 text-dc-pink-accent shrink-0 mt-0.5" aria-hidden="true" />;
  }
  return <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />;
}

function ProposalRow({
  proposal,
  onDismiss,
  onTap,
}: {
  proposal: DonnyProposal;
  onDismiss: (id: string) => void;
  onTap: (p: DonnyProposal) => void;
}) {
  return (
    <div
      data-testid="donny-proposal"
      className="flex items-start gap-3 px-4 py-2.5 border-l-2 border-l-amber-400"
    >
      <ProposalIcon proposal={proposal} />
      <p className="text-sm text-dc-text flex-1 min-w-0">
        {proposal.text}
        {proposal.occurredAt && (
          <span className="text-dc-text-muted"> {formatRelativeTime(proposal.occurredAt)}</span>
        )}
        {proposal.cta && (
          <>
            {' — '}
            <button
              onClick={() => onTap(proposal)}
              className="font-semibold text-dc-teal-btn hover:underline"
            >
              {proposal.cta.label}
            </button>
          </>
        )}
      </p>
      {proposal.dismissible && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(proposal.id);
          }}
          className="text-dc-text-muted hover:text-dc-text shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DonnyHomeProposals({
  result,
  isLoading,
  onDismiss,
  onTap,
  children,
}: DonnyHomeProposalsProps) {
  if (isLoading) {
    return (
      <div data-testid="donny-home-proposals-loading" className="space-y-2">
        <DCSkeleton variant="list-row" count={2} />
      </div>
    );
  }

  const { blocker, proposals, overflowCount } = result;
  // NeedsAttentionSection hides itself when every slot is empty, but returning
  // null here keeps the DOM clean and makes the "nothing to say" case explicit —
  // "nothing to say" now includes no trailing children, since those (e.g. the
  // rating prompts) are their own reason to keep the frame around.
  if (!blocker && proposals.length === 0 && !children) return null;

  return (
    <NeedsAttentionSection>
      {blocker && (
        <ProposalRow proposal={blocker} onDismiss={onDismiss} onTap={onTap} />
      )}
      {proposals.length > 0 && (
        <div className="divide-y divide-dc-teal/10">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onDismiss={onDismiss} onTap={onTap} />
          ))}
          {overflowCount > 0 && (
            <p className="text-xs text-amber-600 font-medium px-4 py-2">
              + {overflowCount} more {overflowCount === 1 ? 'needs' : 'need'} your attention
            </p>
          )}
        </div>
      )}
      {children}
    </NeedsAttentionSection>
  );
}
