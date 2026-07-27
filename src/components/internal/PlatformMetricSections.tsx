import { Fragment } from 'react';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';
import { deriveCardModel, syntheticTotalUsers, type MetricMode } from '@/lib/internal/platformMetricModel';
import { StatCard, SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const INLINE_CARD = 'rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm';

interface Props {
  mode: MetricMode;
  stats: PlatformStats | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** The three count sections (Users & businesses / Activity / Content) shared by the
 *  Overview (real) and Simulation (synthetic) pages. Owns its own loading/error/empty
 *  states so, on Simulation, a platform-stats failure degrades only this block. */
export function PlatformMetricSections({ mode, stats, isLoading, isError }: Props) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[8rem] items-center justify-center ${INLINE_CARD}`}>
        <Spinner className="h-6 w-6 border-teal-400" />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorCard message="Platform stats failed to load — check your internal access." />;
  }
  if (mode === 'synthetic') {
    // Pre-migration RPC: without total_all we can't compute synthetic = all − real, so show a
    // migration-needed state rather than a false "no cohort" (the registry cards below still show bots).
    if (stats.users.total_all === undefined) {
      return (
        <ErrorCard message="Synthetic parity needs the aios_platform_stats totals migration — apply it to populate this view." />
      );
    }
    if (syntheticTotalUsers(stats) <= 0) {
      return (
        <div className={`${INLINE_CARD} text-sm text-white/60`}>
          No synthetic cohort active — turn the kill switch on and seed bots to populate these metrics.
        </div>
      );
    }
  }

  return (
    <>
      {deriveCardModel(stats, mode).map((section) => (
        <Fragment key={section.heading}>
          <SectionHeading>{section.heading}</SectionHeading>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {section.cards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} sub={card.sub} />
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}
