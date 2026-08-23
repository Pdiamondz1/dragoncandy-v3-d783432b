/**
 * The three views Adrian asked for that no existing document answers: when Hoboken becomes a
 * working market, and what 100 / 1,000 / 10,000 businesses mean financially.
 */
import { MARKET } from './assumptions';
import { projectMonth, type TierMix } from './project';

export const LIQUIDITY_THRESHOLD = {
  /** A posted campaign must draw at least this many applicants... */
  minApplicantsPerCampaign: 3,
  /** ...within this many hours. */
  withinHours: 48,
  /** And a creator opening the app must see at least this many campaigns in range. */
  minCampaignsVisibleToCreator: 5,
} as const;

export interface LiquidityState {
  readonly restaurants: number;
  readonly creators: number;
  /** Campaigns accepting applications right now — what a creator actually sees on screen. */
  readonly openCampaigns: number;
  readonly applicantsPerCampaign: number;
  readonly liquid: boolean;
}

/**
 * Both sides of the threshold. Single dense metro, so every campaign is assumed in range of
 * every creator — that is the premise of launching one town at a time, not an oversight.
 *
 * `creators` is an INDEPENDENT parameter, deliberately. Deriving it as
 * `restaurants * creatorsPerRestaurant` makes applicantsPerCampaign a constant
 * (creatorsPerRestaurant * applicationsPerCreator / campaignsPerRestaurant), so that half of
 * the threshold would always hold or never hold and the test would collapse to a restaurant
 * count — reading as "liquid at 2 customers". The two sides are acquired through different
 * channels at different speeds, and creator-side lag is the thing that actually kills local
 * marketplaces, so the model has to be able to express it.
 */
export function isLiquid(restaurants: number, creators: number): LiquidityState {
  const campaignsPerMonth = restaurants * MARKET.campaignsPerRestaurantPerMonth.value;
  const openCampaigns = campaignsPerMonth * (MARKET.campaignOpenDays.value / 30);
  const applications = creators * MARKET.applicationsPerCreatorPerMonth.value;
  const applicantsPerCampaign = campaignsPerMonth === 0 ? 0 : applications / campaignsPerMonth;

  return {
    restaurants,
    creators,
    openCampaigns,
    applicantsPerCampaign,
    liquid:
      openCampaigns >= LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator &&
      applicantsPerCampaign >= LIQUIDITY_THRESHOLD.minApplicantsPerCampaign,
  };
}

export interface LiquidityRampInput {
  readonly restaurantsPerMonth: number;
  readonly creatorsPerMonth: number;
  readonly horizonMonths: number;
}

/**
 * First month both conditions hold, or null if the ramp never gets there in the horizon.
 * Null is a real answer, not a failure: at a poor creator-to-restaurant ratio the applicant
 * side never clears no matter how many restaurants sign, and the model should say so.
 */
export function monthsToLiquidity({
  restaurantsPerMonth,
  creatorsPerMonth,
  horizonMonths,
}: LiquidityRampInput): number | null {
  if (restaurantsPerMonth < 0 || creatorsPerMonth < 0) {
    throw new Error(
      `acquisition rates cannot be negative, got restaurants=${restaurantsPerMonth} creators=${creatorsPerMonth}`,
    );
  }
  for (let month = 1; month <= horizonMonths; month += 1) {
    if (isLiquid(restaurantsPerMonth * month, creatorsPerMonth * month).liquid) return month;
  }
  return null;
}

export interface StepRow {
  readonly businesses: number;
  readonly monthlyRevenue: number;
  readonly annualRevenue: number;
  readonly grossMarginPct: number;
  readonly monthlyGmv: number;
  readonly creators: number;
}

/** Steady-state economics at each business count. Operating expense is deliberately excluded. */
export function businessStepTable(steps: readonly number[], mix: TierMix): StepRow[] {
  return steps.map((businesses) => {
    const m = projectMonth({ month: 0, restaurants: businesses, mix });
    return {
      businesses,
      monthlyRevenue: m.totalRevenue,
      annualRevenue: m.totalRevenue * 12,
      grossMarginPct: m.grossMarginPct,
      monthlyGmv: m.gmvDollars,
      creators: m.creators,
    };
  });
}
