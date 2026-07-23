import { useSimulationStats } from '@/hooks/internal/useSimulationStats';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { formatUsd } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

const KILL_SWITCH_CHIP =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold';

const InternalSimulation = () => {
  const simulation = useSimulationStats();

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
          sub="Daily ceiling: TBD (Phase 3)"
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
    </PageContainer>
  );
};

export default InternalSimulation;
