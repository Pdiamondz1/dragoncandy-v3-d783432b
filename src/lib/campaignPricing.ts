import type { DeliveryTier } from '@/types/campaignMedia';

/**
 * Campaign price suggestion.
 *
 * The generated price used to arrive pre-filled, which read to a first-time business owner
 * as "this is what I'm supposed to pay". The field now starts empty and this module supplies
 * the starting suggestion beneath it. Every number lives here so the band is tunable in one
 * place — the same figures are stated in `donny-campaign-generate`'s system prompt.
 */

/** Platform floor. Mirrors `launchValidationSchema.fixed_price` in campaignCreatorValidation.ts. */
export const MIN_CAMPAIGN_PRICE = 50;

/**
 * Per-deliverable bands for a LOCAL, single-location business trying the platform for the
 * first time — not a national brand. Founder-approved 2026-07-19.
 */
export const TIER_PRICE_BANDS: Record<DeliveryTier, { low: number; high: number }> = {
  standard: { low: 75, high: 150 },
  express: { low: 110, high: 225 },
  dragondash: { low: 150, high: 300 },
};

export interface SuggestedRange {
  min: number;
  max: number;
}

interface SuggestedRangeInput {
  tier: DeliveryTier | null;
  deliverableCount: number;
  /** Donny's own figures. Omit them to force the tier-band fallback. */
  suggestedMin?: number;
  suggestedMax?: number;
}

/**
 * The range shown beneath the price field. Prefers Donny's figures — he can weigh campaign
 * complexity the formula can't — and falls back to `deliverableCount x band` so ideas
 * generated before `suggested_price_*` existed still render a suggestion.
 */
export function getSuggestedRange({
  tier,
  deliverableCount,
  suggestedMin,
  suggestedMax,
}: SuggestedRangeInput): SuggestedRange {
  const band = TIER_PRICE_BANDS[tier ?? 'standard'] ?? TIER_PRICE_BANDS.standard;
  const count = Math.max(1, deliverableCount);

  const min = Math.max(MIN_CAMPAIGN_PRICE, Math.round(suggestedMin ?? band.low * count));
  const max = Math.max(min, Math.round(suggestedMax ?? band.high * count));

  return { min, max };
}

/** Round to the nearest $25 so chips read as prices rather than as arithmetic. */
function roundToQuarter(amount: number): number {
  return Math.max(MIN_CAMPAIGN_PRICE, Math.round(amount / 25) * 25);
}

/**
 * One-tap amounts (low / mid / high) for the price chips — a tap beats typing, per the
 * North Star. Deduped and sorted, so a narrow range never renders the same number twice.
 */
export function getPriceChips({ min, max }: SuggestedRange): number[] {
  const chips = [min, (min + max) / 2, max].map(roundToQuarter);
  return [...new Set(chips)].sort((a, b) => a - b);
}

/** "$150–$300", collapsing to "$150" when the band is a single value. */
export function formatSuggestedRange({ min, max }: SuggestedRange): string {
  return min === max
    ? `$${min.toLocaleString()}`
    : `$${min.toLocaleString()}–$${max.toLocaleString()}`;
}
