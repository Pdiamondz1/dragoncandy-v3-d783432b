import { useMemo, useState } from 'react';
import {
  useFindings,
  useUpdateFindingStatus,
  type Finding,
  type FindingStatus,
} from '@/hooks/internal/useFindings';
import { ErrorCard } from '@/components/internal/stats';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-dc-pink-accent text-white',
  high: 'bg-dc-pink text-dc-dark',
  medium: 'bg-dc-yellow/80 text-dc-dark',
  low: 'bg-dc-teal/20 text-dc-teal',
};

const STATUSES: FindingStatus[] = ['open', 'acknowledged', 'resolved', 'wontfix'];

const STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  wontfix: "Won't fix",
};

const FindingCard = ({ finding }: { finding: Finding }) => {
  const updateStatus = useUpdateFindingStatus();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[finding.severity]}`}
            >
              {finding.severity}
            </span>
            <h3 className="font-bold text-white">{finding.title}</h3>
          </div>
          <p className="mt-1 text-xs text-white/50">
            {finding.source} · seen {finding.occurrences}×, last{' '}
            {new Date(finding.last_seen_at).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={updateStatus.isPending || finding.status === s}
              onClick={() => updateStatus.mutate({ id: finding.id, status: s })}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-default ${
                finding.status === s
                  ? 'bg-dc-teal font-bold text-dc-dark'
                  : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] disabled:opacity-50'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <MarkdownProse>{finding.summary_md}</MarkdownProse>
      </div>

      {Object.keys(finding.evidence ?? {}).length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold text-dc-pink-accent"
          >
            {expanded ? 'Hide evidence' : 'Show evidence'}
          </button>
          {expanded && (
            <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-dc-teal">
              {JSON.stringify(finding.evidence, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

const InternalFindings = () => {
  const findings = useFindings();
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('open');

  const filtered = useMemo(() => {
    const list = findings.data ?? [];
    return statusFilter === 'all' ? list : list.filter((f) => f.status === statusFilter);
  }, [findings.data, statusFilter]);

  if (findings.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (findings.isError || !findings.data) {
    return <ErrorCard message="Findings failed to load." />;
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-white lg:text-2xl">FINDINGS</h1>
      <p className="mt-1 text-sm text-white/60">
        Bug & error discoveries filed by the weekly sweep agent (report-only). Triage here; fixes
        ship through normal PRs.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(['open', 'acknowledged', 'resolved', 'wontfix', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-dc-teal font-bold text-dc-dark'
                : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-sm text-white/60 backdrop-blur-sm">
            {statusFilter === 'open'
              ? 'No open findings — the sweep agent files new ones weekly.'
              : 'Nothing with this status.'}
          </div>
        ) : (
          filtered.map((f) => <FindingCard key={f.id} finding={f} />)
        )}
      </div>
    </div>
  );
};

export default InternalFindings;
