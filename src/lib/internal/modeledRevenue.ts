/**
 * Phase-A MODELED revenue projection for the Synthetic Weight Engine.
 *
 * This is a PROJECTION, not measured revenue. It moves no money and reads only
 * the synthetic campaign count already surfaced by `get_simulation_stats`. Phase B
 * (measured revenue via real settlement) is a separate, later workstream — nothing
 * computed here should ever be read as real GMV or real revenue.
 *
 * Formula (every input is an assumption, surfaced in the UI so the figure reads
 * as a projection):
 *   projected GMV   = synthetic_campaigns × avgCampaignValueUsd
 *   modeled revenue = projected GMV × takeRate
 */

/**
 * Assumed average campaign value (USD). A defensible placeholder for an SMB
 * restaurant↔creator campaign; the real figure lands with Phase B measurement.
 */
export const ASSUMED_AVG_CAMPAIGN_VALUE_USD = 250;

/**
 * Free-tier take-rate — the conservative floor of the ladder (Free 10% →
 * Starter 7% → Growth 5% → Pro 3% → Enterprise 2%). See PROJECT_CONTEXT §8.
 */
export const FREE_TIER_TAKE_RATE = 0.1;

export interface ModeledRevenue {
  /** synthetic_campaigns × avgCampaignValueUsd */
  projectedGmvUsd: number;
  /** projectedGmvUsd × takeRate */
  modeledRevenueUsd: number;
  avgCampaignValueUsd: number;
  takeRate: number;
}

/** Pure projection — no side effects, moves no money. */
export function computeModeledRevenue(
  syntheticCampaigns: number,
  avgCampaignValueUsd: number = ASSUMED_AVG_CAMPAIGN_VALUE_USD,
  takeRate: number = FREE_TIER_TAKE_RATE,
): ModeledRevenue {
  const campaigns = Math.max(0, syntheticCampaigns || 0);
  const projectedGmvUsd = campaigns * avgCampaignValueUsd;
  const modeledRevenueUsd = projectedGmvUsd * takeRate;
  return { projectedGmvUsd, modeledRevenueUsd, avgCampaignValueUsd, takeRate };
}
