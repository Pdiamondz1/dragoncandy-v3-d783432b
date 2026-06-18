import { useMemo, useState } from 'react';
import {
  useCorrections,
  useReviewCorrection,
  type Correction,
  type CorrectionStatus,
} from '@/hooks/internal/useCorrections';
import { normalizeForCompare } from '@/lib/internal/normalizeForCompare';
import { ErrorCard } from '@/components/internal/stats';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

const TARGET_STYLES: Record<string, string> = {
  dashboard_setting: 'bg-dc-teal/20 text-dc-teal',
  strategy_doc: 'bg-dc-pink/20 text-dc-pink',
};

const TARGET_LABELS: Record<string, string> = {
  dashboard_setting: 'Dashboard setting',
  strategy_doc: 'Strategy doc',
};

const STATUS_STYLES: Record<CorrectionStatus, string> = {
  proposed: 'bg-dc-yellow/80 text-dc-dark',
  applied: 'bg-dc-teal text-dc-dark',
  approved: 'bg-dc-teal/30 text-dc-teal',
  rejected: 'bg-dc-pink-accent/80 text-white',
  superseded: 'bg-dc-pink/30 text-dc-pink',
};

const STATUS_LABELS: Record<CorrectionStatus, string> = {
  proposed: 'Proposed',
  applied: 'Applied',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

/** jsonb values arrive as string (docs), number (settings), or richer JSON. */
const formatValue = (v: unknown): string => {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
};

const CorrectionCard = ({ correction }: { correction: Correction }) => {
  const review = useReviewCorrection();
  const isDecided = correction.status !== 'proposed';

  const before = formatValue(correction.current_value);
  const after = formatValue(correction.proposed_value);
  // Pre-flag a no-op: proposed already equals current (ignoring trailing whitespace).
  const isNoOp = normalizeForCompare(before) === normalizeForCompare(after);

  // Surface a superseded outcome (live value drifted since the proposal) so the
  // founder knows nothing was applied and Donny should re-propose.
  const superseded = review.data?.status === 'superseded';

  return (
    <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                TARGET_STYLES[correction.target_type] ?? 'bg-dc-teal/20 text-dc-teal'
              }`}
            >
              {TARGET_LABELS[correction.target_type] ?? correction.target_type}
            </span>
            <h3 className="font-bold text-white">{correction.title}</h3>
          </div>
          <p className="mt-1 font-mono text-xs text-white/50">
            {correction.target_ref} · {correction.proposed_by} ·{' '}
            {new Date(correction.created_at).toLocaleString()}
          </p>
        </div>
        {isDecided ? (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[correction.status]}`}
          >
            {STATUS_LABELS[correction.status]}
          </span>
        ) : (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate({ id: correction.id, decision: 'approve' })}
              className="rounded-full bg-dc-teal px-4 py-1 text-xs font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
            >
              {review.isPending ? '…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate({ id: correction.id, decision: 'reject' })}
              className="rounded-full bg-white/[0.06] px-4 py-1 text-xs font-semibold text-dc-pink transition-colors hover:bg-white/[0.12] disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-white/40">
            Current
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-white/70">
            {before}
          </pre>
        </div>
        <div className="rounded-xl border border-dc-teal/30 bg-dc-teal/[0.06] p-3">
          <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-dc-teal">
            Proposed
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-dc-teal">
            {after}
          </pre>
        </div>
      </div>

      {isNoOp && !isDecided && (
        <p className="mt-2 text-xs font-semibold text-dc-pink">
          Proposed value matches the current value — approving would change nothing.
        </p>
      )}

      <div className="mt-3">
        <MarkdownProse>{correction.rationale_md}</MarkdownProse>
      </div>

      {superseded && (
        <p className="mt-3 rounded-xl border border-dc-pink/30 bg-dc-pink/10 p-3 text-xs font-semibold text-dc-pink">
          {review.data?.message ??
            'The live value changed since this was proposed — nothing was applied. Ask Donny to re-propose.'}
        </p>
      )}

      {review.isError && (
        <p className="mt-3 text-xs font-semibold text-dc-pink-accent">
          Review failed — {(review.error as Error)?.message ?? 'try again.'}
        </p>
      )}
    </div>
  );
};

const InternalCorrections = () => {
  const corrections = useCorrections();
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list = corrections.data ?? [];
    return showAll ? list : list.filter((c) => c.status === 'proposed');
  }, [corrections.data, showAll]);

  if (corrections.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (corrections.isError || !corrections.data) {
    return <ErrorCard message="Corrections failed to load." />;
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-white lg:text-2xl">CORRECTIONS</h1>
      <p className="mt-1 text-sm text-white/60">
        Fixes Donny proposes to dashboard settings and strategy docs. Donny never applies them — you
        approve here, then the change takes effect.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {([
          { key: false, label: 'Proposed' },
          { key: true, label: 'All' },
        ] as const).map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setShowAll(opt.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              showAll === opt.key
                ? 'bg-dc-teal font-bold text-dc-dark'
                : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-sm text-white/60 backdrop-blur-sm">
            {showAll
              ? 'No corrections yet — Donny files them when you point out something wrong.'
              : 'No corrections waiting for review.'}
          </div>
        ) : (
          filtered.map((c) => <CorrectionCard key={c.id} correction={c} />)
        )}
      </div>
    </div>
  );
};

export default InternalCorrections;
