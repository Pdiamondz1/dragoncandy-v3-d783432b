import { useSimulationStats } from '@/hooks/internal/useSimulationStats';
import { useSimLoadSnapshots, type SimLoadSnapshot } from '@/hooks/internal/useSimLoadSnapshots';
import {
  useSimLoadMatrixSummary,
  type SimLoadMatrixSummary,
} from '@/hooks/internal/useSimLoadMatrixSummary';
import { computeModeledRevenue } from '@/lib/internal/modeledRevenue';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { formatUsd } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

const KILL_SWITCH_CHIP =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold';

const CARD = 'rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm';

/** Error rate at/above which a load-curve row is tinted as saturation (10%). */
const ERROR_RATE_WARN_THRESHOLD = 0.1;

const fmtMs = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} ms`);
const fmtPct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const fmtConc = (active: number | null, max: number | null) =>
  active == null && max == null ? '—' : `${active ?? '—'} / ${max ?? '—'}`;
const fmtBytes = (n: number | null) => {
  if (n == null) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** The summed roll-up of the latest multi-shard MATRIX run — offered concurrency (Σ across shards)
 *  vs the DB-side connection/latency peaks, plus the media-egress proxy and the storage point reading.
 *  Handles its own loading/error/empty so a summary fetch failure never blanks the page. */
function MatrixSummaryCard({
  isLoading,
  isError,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  data: SimLoadMatrixSummary | null | undefined;
}) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[8rem] items-center justify-center ${CARD}`}>
        <Spinner className="h-6 w-6 border-teal-400" />
      </div>
    );
  }
  if (isError) {
    return <ErrorCard message="Matrix summary failed to load — check your internal access." />;
  }
  if (!data) {
    return (
      <div className={`p-6 text-sm text-white/60 ${CARD}`}>
        No matrix run captured yet — dispatch <span className="font-mono">synthetic-load-matrix.yml</span>{' '}
        (a <span className="font-mono">matrix-*</span> run label) to fan the load across N runner IPs.
      </div>
    );
  }
  return (
    <div className={`p-5 ${CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-white">{data.run_label}</span>
        <span className="font-mono text-xs text-white/40">{data.shards} shard(s) summed</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Honest peak concurrency"
          value={data.honest_peak_concurrency}
          sub={`${data.max_concurrent_shards} shards overlapped`}
          accent="pink"
        />
        <StatCard
          label="Offered concurrency"
          value={data.offered_concurrency}
          sub={`naive Σ across ${data.shards} shards`}
        />
        <StatCard
          label="DB active / max conns"
          value={`${data.db_active_conn_peak} / ${data.max_connections}`}
          sub="peak"
          accent="pink"
        />
        <StatCard label="p95 latency" value={fmtMs(data.p95_ms)} sub="max across shards" />
        <StatCard
          label="Requests"
          value={data.requests}
          sub={`${data.ok} ok · ${data.breakage} brk · ${data.throttled} thr`}
        />
        <StatCard label="Media requests" value={data.media_requests} />
        <StatCard label="Media egress" value={fmtBytes(data.media_bytes)} sub="Σ real bytes (Range-capped GET)" />
        <StatCard label="Media errors" value={data.media_errors} sub="egress failures (not breakage)" />
        <StatCard label="Media p95 latency" value={fmtMs(data.media_ms_p95_peak)} sub="peak across shards" />
        <StatCard
          label="Storage bytes"
          value={fmtBytes(data.storage_bytes)}
          sub="point reading (~0 growth by design)"
        />
        <StatCard label="DB avg query" value={fmtMs(data.db_avg_query_ms_peak)} sub="peak" />
      </div>
    </div>
  );
}

/** The performance-per-concurrency curve captured across a load ramp. Handles its
 *  own loading/error/empty states so a snapshot fetch failure never blanks the page. */
function LoadCurveTable({
  isLoading,
  isError,
  rows,
}: {
  isLoading: boolean;
  isError: boolean;
  rows: SimLoadSnapshot[];
}) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[8rem] items-center justify-center ${CARD}`}>
        <Spinner className="h-6 w-6 border-teal-400" />
      </div>
    );
  }
  if (isError) {
    return <ErrorCard message="Load snapshots failed to load — check your internal access." />;
  }
  if (rows.length === 0) {
    return (
      <div className={`p-6 text-sm text-white/60 ${CARD}`}>
        No load snapshots yet — run a load ramp (docs/runbooks/synthetic-load-tier-ramp.md) to
        capture the performance-per-concurrency curve.
      </div>
    );
  }
  return (
    <div className={`overflow-x-auto ${CARD}`}>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/40">
            <th className="px-4 py-3 font-mono font-medium">Run</th>
            <th className="px-4 py-3 font-mono font-medium">Captured</th>
            <th className="px-4 py-3 text-right font-mono font-medium">Active / max conns</th>
            <th className="px-4 py-3 text-right font-mono font-medium">Avg query</th>
            <th className="px-4 py-3 text-right font-mono font-medium">Error rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/5 text-white/80 last:border-b-0">
              <td className="px-4 py-3 font-semibold text-white">{r.run_label ?? '—'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-white/60">
                {new Date(r.captured_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {fmtConc(r.active_connections, r.max_connections)}
              </td>
              <td className="px-4 py-3 text-right font-mono">{fmtMs(r.avg_query_ms)}</td>
              <td
                className={`px-4 py-3 text-right font-mono ${
                  r.error_rate != null && r.error_rate >= ERROR_RATE_WARN_THRESHOLD
                    ? 'text-dc-pink'
                    : ''
                }`}
              >
                {fmtPct(r.error_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** MODELED revenue projection (spec §4e, Phase A). Deliberately styled distinct from
 *  the measured StatCards — dashed muted border + a MODELED badge + inline assumptions —
 *  so it can never be mistaken for real revenue. Phase B measures actual money movement. */
function ModeledRevenueCard({ syntheticCampaigns }: { syntheticCampaigns: number }) {
  const m = computeModeledRevenue(syntheticCampaigns);
  return (
    <div className="rounded-2xl border border-dashed border-white/25 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-dc-yellow/50 bg-dc-yellow/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-dc-yellow">
          Modeled
        </span>
        <span className="text-xs text-white/40">
          Projection — not real revenue. Phase B measures actual money movement.
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/40">
            Projected GMV
          </p>
          <p className="mt-1 text-3xl font-extrabold text-white/70">
            {formatUsd(m.projectedGmvUsd)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/40">
            Modeled revenue
          </p>
          <p className="mt-1 text-3xl font-extrabold text-white/70">
            {formatUsd(m.modeledRevenueUsd)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-white/40">
        Assumptions: {syntheticCampaigns.toLocaleString()} synthetic campaigns ×{' '}
        {formatUsd(m.avgCampaignValueUsd)} assumed avg campaign value = projected GMV; ×{' '}
        {(m.takeRate * 100).toFixed(0)}% free-tier take-rate = modeled revenue. A pure projection —
        it moves no money.
      </p>
    </div>
  );
}

const InternalSimulation = () => {
  const simulation = useSimulationStats();
  const loadSnapshots = useSimLoadSnapshots();
  const matrixSummary = useSimLoadMatrixSummary();

  if (simulation.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (simulation.isError || !simulation.data) {
    return (
      <ErrorCard message="Simulation stats failed to load. Check your internal access and try again." />
    );
  }

  const s = simulation.data;
  const personaEntries = Object.entries(s.bots_by_persona ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Synthetic Weight Engine"
        subtitle="The one surface that intentionally shows synthetic (bot) data — every other metric surface hides it."
        actions={
          <p className="font-mono text-xs text-white/40">
            Last updated {new Date(s.generated_at).toLocaleString()}
          </p>
        }
      />

      <div
        className={`${KILL_SWITCH_CHIP} ${
          s.kill_switch_enabled
            ? 'border-dc-pink-accent/50 bg-dc-pink-accent/15 text-dc-pink'
            : 'border-dc-teal/40 bg-dc-teal/15 text-dc-teal'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            s.kill_switch_enabled ? 'bg-dc-pink-accent' : 'bg-dc-teal'
          }`}
        />
        Kill switch: {s.kill_switch_enabled ? 'ON — bots are being generated' : 'OFF'}
      </div>

      <SectionHeading>Cohort</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Bots total" value={s.bots_total} />
        <StatCard label="Synthetic campaigns" value={s.synthetic_campaigns} />
        <StatCard label="Synthetic messages" value={s.synthetic_messages} />
        <StatCard
          label="Synthetic MTD AI spend"
          value={formatUsd(s.synthetic_ai_spend_mtd_usd)}
          sub="Real cost of the synthetic run"
          accent="pink"
        />
      </div>

      <SectionHeading>Bots by persona</SectionHeading>
      {personaEntries.length === 0 ? (
        <ErrorCard message="No synthetic personas yet." />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {personaEntries.map(([persona, count]) => (
            <StatCard key={persona} label={persona} value={count} />
          ))}
        </div>
      )}

      <SectionHeading>Matrix run (summed)</SectionHeading>
      <p className="-mt-1 mb-3 text-sm text-white/50">
        The latest multi-shard runner-matrix run — offered concurrency summed across N runner IPs vs
        the DB-side connection/latency peaks (a single runner caps at the ~312 egress wall), plus the
        media-egress proxy and the storage point reading.
      </p>
      <MatrixSummaryCard
        isLoading={matrixSummary.isLoading}
        isError={matrixSummary.isError}
        data={matrixSummary.data}
      />

      <SectionHeading>Load curve</SectionHeading>
      <p className="-mt-1 mb-3 text-sm text-white/50">
        Performance per concurrency across a load ramp — active vs max Postgres connections, avg
        query time, and error rate at each captured step (newest first).
      </p>
      <LoadCurveTable
        isLoading={loadSnapshots.isLoading}
        isError={loadSnapshots.isError}
        rows={loadSnapshots.data ?? []}
      />

      <SectionHeading>Modeled revenue</SectionHeading>
      <ModeledRevenueCard syntheticCampaigns={s.synthetic_campaigns} />
    </PageContainer>
  );
};

export default InternalSimulation;
