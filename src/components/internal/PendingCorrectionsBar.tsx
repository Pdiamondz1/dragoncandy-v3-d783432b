import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  useCorrections,
  useReviewCorrection,
  type Correction,
} from '@/hooks/internal/useCorrections';

const TARGET_STYLES: Record<string, string> = {
  dashboard_setting: 'bg-dc-teal/20 text-dc-teal',
  strategy_doc: 'bg-dc-pink/20 text-dc-pink',
};

const TARGET_LABELS: Record<string, string> = {
  dashboard_setting: 'Dashboard',
  strategy_doc: 'Doc',
};

/** Short one-line "before → after" for scalar settings; docs link out instead. */
const compactChange = (c: Correction): string | null => {
  if (c.target_type !== 'dashboard_setting') return null;
  const fmt = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
  const before = fmt(c.current_value);
  const after = fmt(c.proposed_value);
  if (before.length > 24 || after.length > 24) return null;
  return `${before} → ${after}`;
};

const PendingCorrectionRow = ({ correction }: { correction: Correction }) => {
  const review = useReviewCorrection();
  const change = compactChange(correction);

  const handle = (decision: 'approve' | 'reject') =>
    review.mutate(
      { id: correction.id, decision },
      {
        onSuccess: (res) => {
          if (res.status === 'applied') toast.success('Correction applied.');
          else if (res.status === 'rejected') toast('Proposal rejected.');
          else if (res.status === 'superseded')
            toast(
              res.message ??
                'The live value changed since this was proposed — nothing was applied. Ask Donny to re-propose.',
            );
          else toast(res.message ?? `Status: ${res.status}`);
        },
        onError: (e) => toast.error(`Review failed — ${(e as Error)?.message ?? 'try again.'}`),
      },
    );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dc-teal/20 bg-black/20 px-3 py-2">
      <span
        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase ${
          TARGET_STYLES[correction.target_type] ?? 'bg-dc-teal/20 text-dc-teal'
        }`}
      >
        {TARGET_LABELS[correction.target_type] ?? correction.target_type}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-white/80">
        {correction.title}
        {change && <span className="ml-2 font-mono text-dc-teal">{change}</span>}
      </span>
      <Link
        to="/internal/corrections"
        className="text-[0.7rem] font-semibold text-white/50 transition-colors hover:text-white"
      >
        Details
      </Link>
      <button
        type="button"
        disabled={review.isPending}
        onClick={() => handle('approve')}
        className="rounded-full bg-dc-teal px-3 py-1 text-[0.7rem] font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
      >
        {review.isPending ? '…' : 'Approve'}
      </button>
      <button
        type="button"
        disabled={review.isPending}
        onClick={() => handle('reject')}
        className="rounded-full bg-white/[0.06] px-3 py-1 text-[0.7rem] font-semibold text-dc-pink transition-colors hover:bg-white/[0.12] disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
};

/**
 * Inline approval surface for the Internal Donny chat: when Donny files a
 * correction proposal, it appears here so the founder can approve/reject without
 * leaving the conversation. Mirrors the /internal/corrections review actions
 * (same RPC + outcome toasts). Renders nothing when the queue is empty.
 */
export const PendingCorrectionsBar = () => {
  const corrections = useCorrections();
  const pending = (corrections.data ?? []).filter((c) => c.status === 'proposed');

  if (pending.length === 0) return null;

  return (
    <div className="border-b border-dc-teal/20 px-3 py-2">
      <p className="mb-1.5 px-1 text-[0.65rem] font-bold uppercase tracking-wide text-dc-teal">
        {pending.length} correction{pending.length > 1 ? 's' : ''} awaiting your approval
      </p>
      <div className="space-y-1.5">
        {pending.map((c) => (
          <PendingCorrectionRow key={c.id} correction={c} />
        ))}
      </div>
    </div>
  );
};
