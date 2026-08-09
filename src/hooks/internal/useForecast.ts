import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import { useSimLoadMatrixSummary } from '@/hooks/internal/useSimLoadMatrixSummary';
import { useCurrentTierIndex } from '@/hooks/internal/useDashboardSettings';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { useOperatingExpenses } from '@/hooks/internal/useOperatingExpenses';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useForecastAssumptions } from '@/hooks/internal/useForecastAssumptions';
import {
  buildForecast, type ForecastMeasured, type ForecastModel, type LoadCeiling,
} from '@/lib/internal/forecastModel';
import { DEFAULT_TIER_INDEX } from '@/lib/internal/weightThresholds';

export interface UseForecastResult {
  model: ForecastModel | null;
  isLoading: boolean;
  isError: boolean;
  businessSharePct: number; // current: % of users that are businesses (a hint for the assumptions panel)
}

/** Composes the measured inputs + founder assumptions into the pure forecast model. Extracted from
 *  InternalForecast so /internal/{overview,weight,scorecard} can compute the same model for the demo hero. */
export function useForecast(): UseForecastResult {
  const platformStats = usePlatformStats();
  const weight = usePlatformWeight();
  const assumptionsQuery = useForecastAssumptions();
  const matrix = useSimLoadMatrixSummary();
  const { data: currentTierIndex = DEFAULT_TIER_INDEX } = useCurrentTierIndex();
  const cost = useCostStats();
  const expenses = useOperatingExpenses();
  const revenue = useRevenueStats();

  const isLoading = platformStats.isLoading || weight.isLoading || assumptionsQuery.isLoading;
  const isError =
    platformStats.isError || !platformStats.data ||
    assumptionsQuery.isError || !assumptionsQuery.data ||
    weight.isError || cost.isError || revenue.isError || expenses.isError;

  if (isLoading || isError || !platformStats.data || !assumptionsQuery.data) {
    return { model: null, isLoading, isError, businessSharePct: 0 };
  }

  const stats = platformStats.data;
  const assumptions = assumptionsQuery.data;
  const weightRows = weight.data ?? [];
  const latestWeight = weightRows.length > 0 ? weightRows[weightRows.length - 1] : null;

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
    (expenses.data ?? []).filter((e) => e.active).reduce((sum, e) => sum + e.monthly_amount_cents, 0) / 100;

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

  const totalUsers = stats.users.total;
  const businesses = stats.businesses.restaurants + stats.businesses.brands;
  const businessSharePct = Math.round((businesses / Math.max(1, totalUsers)) * 100);

  return { model: buildForecast({ measured, assumptions }), isLoading: false, isError: false, businessSharePct };
}
