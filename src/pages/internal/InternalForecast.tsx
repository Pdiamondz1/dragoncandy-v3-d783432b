/**
 * InternalForecast — the /internal/forecast page. Wires the existing internal hooks into a
 * measured input for the pure forecast model, then renders the scenario table + the
 * admin-editable assumptions panel. Admin-gated at the route (reads admin-only cost sources).
 * Dark ops-deck theme; the model/table/panel are pure — this page only sources + composes.
 */
import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import { useSimLoadMatrixSummary } from '@/hooks/internal/useSimLoadMatrixSummary';
import { useCurrentTierIndex } from '@/hooks/internal/useDashboardSettings';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { useOperatingExpenses } from '@/hooks/internal/useOperatingExpenses';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useForecastAssumptions } from '@/hooks/internal/useForecastAssumptions';
import {
  buildForecast,
  type ForecastMeasured,
  type LoadCeiling,
} from '@/lib/internal/forecastModel';
import { DEFAULT_TIER_INDEX } from '@/lib/internal/weightThresholds';
import { ForecastTable } from '@/components/internal/ForecastTable';
import { ForecastAssumptionsPanel } from '@/components/internal/ForecastAssumptionsPanel';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const InternalForecast = () => {
  // Core queries — block on these three (the model can't render without stats/assumptions).
  const platformStats = usePlatformStats();
  const weight = usePlatformWeight();
  const assumptionsQuery = useForecastAssumptions();

  // Secondary sources — degrade to sensible fallbacks so the page renders and fills in as they resolve.
  const matrix = useSimLoadMatrixSummary();
  const { data: currentTierIndex = DEFAULT_TIER_INDEX } = useCurrentTierIndex();
  const cost = useCostStats();
  const expenses = useOperatingExpenses();
  const revenue = useRevenueStats();

  if (platformStats.isLoading || weight.isLoading || assumptionsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  // Any core cost/footprint input that ERRORS must surface — forecasting from a silent $0 (AI spend,
  // revenue, opex) or 0 bytes (weight) would understate cost / inflate margin, an honesty-rail violation.
  // (isLoading is fine — those secondary queries fill in; only isError is fatal.) An empty-but-successful
  // weight legitimately degrades to 0s below (only the measured "Today" column is affected).
  if (
    platformStats.isError || !platformStats.data ||
    assumptionsQuery.isError || !assumptionsQuery.data ||
    weight.isError || cost.isError || revenue.isError || expenses.isError
  ) {
    return <ErrorCard message="Forecast failed to load — check your internal access and try again." />;
  }

  const stats = platformStats.data;
  const assumptions = assumptionsQuery.data;

  // Latest weight snapshot (ascending array; no snapshot → 0s — the model tolerates it).
  const weightRows = weight.data ?? [];
  const latestWeight = weightRows.length > 0 ? weightRows[weightRows.length - 1] : null;

  // Map the summed matrix run into the model's LoadCeiling (or null → the model uses default coeffs).
  const loadMatrix: LoadCeiling | null = matrix.data
    ? {
        honest_peak_concurrency: matrix.data.honest_peak_concurrency,
        db_active_conn_peak: matrix.data.db_active_conn_peak,
        max_connections: matrix.data.max_connections,
        media_bytes: matrix.data.media_bytes,
        media_requests: matrix.data.media_requests,
      }
    : null;

  const currentOpexUsd =
    (expenses.data ?? [])
      .filter((e) => e.active)
      .reduce((sum, e) => sum + e.monthly_amount_cents, 0) / 100;

  const measured: ForecastMeasured = {
    dbBytes: latestWeight?.db_bytes ?? 0,
    storageBytes: latestWeight?.storage_bytes ?? 0,
    registeredUsersReal: stats.users.total,
    currentTierIndex,
    loadMatrix,
    currentAiSpendUsd: cost.data?.mtd_spend_usd ?? 0,
    currentOpexUsd,
    currentRevenueUsd: (revenue.data?.dragonshare_mtd.platform_fee_cents ?? 0) / 100,
  };

  const model = buildForecast({ measured, assumptions });

  // The one derived hint we can source cleanly (businesses = restaurants + brands, of total users).
  const totalUsers = stats.users.total;
  const businesses = stats.businesses.restaurants + stats.businesses.brands;
  const businessSharePct = Math.round((businesses / Math.max(1, totalUsers)) * 100);

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Scale & cost forecast"
        subtitle="A what-if capacity + unit-economics model — measured where possible, assumptions elsewhere. Not a growth projection."
      />

      <ForecastTable model={model} />

      <SectionHeading>Assumptions</SectionHeading>
      <ForecastAssumptionsPanel
        assumptions={assumptions}
        hints={{ business_share_pct: `current: ${businessSharePct}% of users are businesses` }}
      />

      <p className="mt-4 text-xs text-white/45">
        Today is measured from live platform data; 500K / 750K / 1M are modeled from the assumptions
        above. This is a capacity + unit-economics what-if, not a growth projection.
      </p>
    </PageContainer>
  );
};

export default InternalForecast;
