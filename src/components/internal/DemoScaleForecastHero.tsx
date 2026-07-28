import { isDemoScale } from '@/lib/internal/demoScale';
import { useForecast } from '@/hooks/internal/useForecast';
import { selectDemoScaleScenario } from '@/lib/internal/demoScaleScenario';
import { StatCard, SectionHeading } from '@/components/internal/stats';
import { formatUsd } from '@/lib/utils';

/** Badged "at 1M DAU" projection hero for the internal deck. Reuses the pure forecast model (no forked
 *  math); self-gates on isDemoScale(); returns null off or before the model resolves so real query paths
 *  are never blocked. Every figure is explicitly PROJECTED — it must never read as measured/real. */
export function DemoScaleForecastHero() {
  const { model } = useForecast();
  if (!isDemoScale() || !model) return null;
  const s = selectDemoScaleScenario(model);
  if (!s) return null;

  return (
    <section className="rounded-2xl border border-dashed border-dc-yellow/40 bg-dc-yellow/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-dc-yellow/60 bg-dc-yellow/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-dc-yellow">
          Projected · 1M DAU
        </span>
        <span className="text-xs text-white/50">
          Modeled from the forecast assumptions — not measured on this instance.
        </span>
      </div>
      <SectionHeading>At 1M daily active users</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Daily active users" value={(1_000_000).toLocaleString()} accent="pink" />
        <StatCard label="Registered users" value={s.registeredUsers.toLocaleString()} />
        <StatCard label="Monthly cost" value={formatUsd(s.totalCostUsd)} sub={s.computeTier} />
        <StatCard
          label="Gross margin"
          value={s.marginPct != null ? `${Math.round(s.marginPct * 100)}%` : '—'}
          sub={`${formatUsd(s.revenueUsd)}/mo revenue`}
          accent="pink"
        />
      </div>
    </section>
  );
}
