import type { PlatformStats } from '@/hooks/internal/usePlatformStats';
import { deriveCombinedTotals } from '@/lib/internal/platformMetricModel';
import { StatCard, SectionHeading } from '@/components/internal/stats';

/**
 * "Platform totals — real + simulated": one strip at the very top of the Overview showing the grand
 * total (real AND synthetic combined) for each headline entity, with its real/synthetic split in the
 * sub-line. Answers "how much is on the platform, everything included?" at a glance — the real-only
 * breakdown lives in the sections below. See [[Internal Real-vs-Total Metrics]].
 */
export function PlatformTotalsPanel({ stats }: { stats: PlatformStats }) {
  const cards = deriveCombinedTotals(stats);

  return (
    <>
      <SectionHeading>Platform totals — real + simulated</SectionHeading>
      <p className="-mt-1 mb-3 text-xs text-white/45">
        Everything on the platform, real and simulated combined — the real-only breakdown is in the
        sections below.
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.total.toLocaleString()}
            sub={
              c.synthetic > 0
                ? `${c.real.toLocaleString()} real · ${c.synthetic.toLocaleString()} simulated`
                : undefined
            }
          />
        ))}
      </div>
    </>
  );
}
