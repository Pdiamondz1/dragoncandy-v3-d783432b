/**
 * One month of the business, computed from the register. Pure — no dates, no I/O.
 *
 * Revenue is two of the four live streams: subscription and take rate. Donny credit overages
 * and DragonDash rush surcharges are real and live in the app, but nothing has ever been
 * charged, so modeling them would add MODELED revenue on top of MODELED volume. They are
 * named on the deck's revenue slide and excluded from the projection deliberately: the model
 * understates rather than overstates.
 */
import { PRICING, TIER_TAKE_RATES, MARKET, UNIT_ECONOMICS, type TierName } from './assumptions';

export type TierMix = Record<TierName, number>;

const TIERS: TierName[] = ['free', 'starter', 'growth', 'pro'];

function assertMixSumsToOne(mix: TierMix): void {
  const total = TIERS.reduce((sum, t) => sum + mix[t], 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`Tier mix must sum to 1, got ${total}`);
  }
}

export function blendedSubscription(mix: TierMix): number {
  assertMixSumsToOne(mix);
  return TIERS.reduce((sum, t) => sum + mix[t] * PRICING[t].value, 0);
}

export function blendedTakeRate(mix: TierMix): number {
  assertMixSumsToOne(mix);
  return TIERS.reduce((sum, t) => sum + mix[t] * TIER_TAKE_RATES[t].value, 0);
}

/** Midpoint of the app's own standard-delivery band, times deliverables per campaign. */
export function avgCampaignValue(): number {
  const midBand =
    (MARKET.campaignPriceStandardLow.value + MARKET.campaignPriceStandardHigh.value) / 2;
  return midBand * MARKET.deliverablesPerCampaign.value;
}

export interface MonthInput {
  readonly month: number;
  readonly restaurants: number;
  readonly mix: TierMix;
  /** Payroll, marketing, G&A. Excluded from cost of revenue by definition. */
  readonly operatingExpense?: number;
}

export interface MonthResult {
  readonly month: number;
  readonly restaurants: number;
  readonly creators: number;
  readonly campaigns: number;
  readonly gmvDollars: number;
  readonly subscriptionRevenue: number;
  readonly takeRateRevenue: number;
  readonly totalRevenue: number;
  readonly costOfRevenue: number;
  readonly grossProfit: number;
  readonly grossMarginPct: number;
  readonly operatingExpense: number;
  readonly ebitda: number;
}

export function projectMonth({ month, restaurants, mix, operatingExpense = 0 }: MonthInput): MonthResult {
  // Creators at the TARGET ratio. Fine here, because creators pay nothing and this figure is
  // reported rather than used in any revenue term. Liquidity is the opposite case and takes
  // creators as an independent input — see the note in derive.ts on why that matters.
  const creators = Math.round(restaurants * MARKET.creatorsPerRestaurant.value);
  const campaigns = restaurants * MARKET.campaignsPerRestaurantPerMonth.value;
  const gmvDollars = campaigns * avgCampaignValue();

  const subscriptionRevenue = restaurants * blendedSubscription(mix);
  const takeRateRevenue = gmvDollars * blendedTakeRate(mix);
  const totalRevenue = subscriptionRevenue + takeRateRevenue;

  // Stripe is charged on the full campaign amount that moves through the platform, then
  // recovered inside the take rate — so it is a cost of revenue, not an infrastructure line.
  const stripeCost =
    gmvDollars * UNIT_ECONOMICS.stripePctFee.value + campaigns * UNIT_ECONOMICS.stripeFixedFee.value;
  const serveCost =
    restaurants *
    (UNIT_ECONOMICS.aiCostPerCustomerMonth.value + UNIT_ECONOMICS.infraCostPerCustomerMonth.value);
  const costOfRevenue = stripeCost + serveCost;

  const grossProfit = totalRevenue - costOfRevenue;

  return {
    month,
    restaurants,
    creators,
    campaigns,
    gmvDollars,
    subscriptionRevenue,
    takeRateRevenue,
    totalRevenue,
    costOfRevenue,
    grossProfit,
    grossMarginPct: totalRevenue === 0 ? 0 : (grossProfit / totalRevenue) * 100,
    operatingExpense,
    ebitda: grossProfit - operatingExpense,
  };
}
