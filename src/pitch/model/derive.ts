/**
 * The three views Adrian asked for that no existing document answers: when Hoboken becomes a
 * working market, and what 100 / 1,000 / 10,000 businesses mean financially.
 */
import { MARKET, TRAJECTORY } from './assumptions';
import { projectMonth, type TierMix } from './project';

/**
 * The two conditions `isLiquid` actually tests. Both are computed over a campaign's whole
 * open window (`MARKET.campaignOpenDays`) — there is no 48-hour slice anywhere in this
 * arithmetic. An earlier version of this constant also carried `withinHours: 48`, describing
 * `minApplicantsPerCampaign` as "3 applicants within 48 hours." That was a Codex P1 finding
 * (2026-08-23): the label promised a responsiveness window the code never computed, so a
 * reader could believe an approval-speed guarantee this model does not support.
 *
 * The fix is the label, not the arithmetic. Scaling `applicantsPerCampaign` into a 48-hour
 * slice would require an arrival-curve assumption we have no evidence for — applications to a
 * newly posted campaign plausibly front-load rather than arriving uniformly across the open
 * window, and inventing a distribution to force a "within 48 hours" number is exactly the
 * plausible-but-unfounded figure this model exists to avoid. The quantity already computed
 * — applicants per campaign over its full open window — is the one that answers the question
 * that matters pre-launch: does a business posting a campaign get a real choice of creators.
 * "Within 48 hours" is a RESPONSIVENESS property, only measurable from real post-launch data.
 * See `POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS` below.
 */
export const LIQUIDITY_THRESHOLD = {
  /** A posted campaign must draw at least this many qualified applicants over its open window. */
  minApplicantsPerCampaign: 3,
  /** And a creator opening the app must see at least this many campaigns in range. */
  minCampaignsVisibleToCreator: 5,
} as const;

/**
 * NOT part of `isLiquid`'s pass/fail test — this model has no arrival-curve assumption to
 * compute it from. Recorded here as the operational target to START MEASURING once real
 * applicant-arrival timestamps exist post-launch (our own schema can compute it the day we
 * launch), not as a condition this financial model enforces today.
 */
export const POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS = 48;

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
  // Applicants a single campaign draws over its ENTIRE open window (MARKET.campaignOpenDays,
  // currently 14 days) — not within any fixed hours-since-posted slice. No arrival-curve
  // assumption exists in this model to compute a sub-window figure honestly, so none is
  // computed here; see the comment on LIQUIDITY_THRESHOLD above.
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

export interface TrajectoryYear {
  readonly year: 1 | 2 | 3;
  readonly revenueLow: number;
  readonly revenueHigh: number;
  /**
   * All-in cost, not operating expense alone. The cited line-item breakdown includes Stripe
   * fees, AI and infrastructure spend alongside payroll, marketing and legal, so `opex` would
   * misstate what this contains.
   */
  readonly totalCostLow: number;
  readonly totalCostHigh: number;
  readonly ebitdaLow: number;
  readonly ebitdaHigh: number;
}

/**
 * The three-year revenue/cost/EBITDA bands the investor advisor asked for by name. Low EBITDA
 * pairs low revenue with HIGH cost (the worst case); high EBITDA pairs high revenue with LOW
 * cost (the best case) — pairing low revenue with low cost would understate the downside.
 */
export function threeYearTrajectory(): TrajectoryYear[] {
  const years: Array<{
    year: 1 | 2 | 3;
    revenueLow: number;
    revenueHigh: number;
    totalCostLow: number;
    totalCostHigh: number;
  }> = [
    {
      year: 1,
      revenueLow: TRAJECTORY.year1RevenueLow.value,
      revenueHigh: TRAJECTORY.year1RevenueHigh.value,
      totalCostLow: TRAJECTORY.year1CostLow.value,
      totalCostHigh: TRAJECTORY.year1CostHigh.value,
    },
    {
      year: 2,
      revenueLow: TRAJECTORY.year2RevenueLow.value,
      revenueHigh: TRAJECTORY.year2RevenueHigh.value,
      totalCostLow: TRAJECTORY.year2CostLow.value,
      totalCostHigh: TRAJECTORY.year2CostHigh.value,
    },
    {
      year: 3,
      revenueLow: TRAJECTORY.year3RevenueLow.value,
      revenueHigh: TRAJECTORY.year3RevenueHigh.value,
      totalCostLow: TRAJECTORY.year3CostLow.value,
      totalCostHigh: TRAJECTORY.year3CostHigh.value,
    },
  ];

  return years.map((y) => ({
    ...y,
    ebitdaLow: y.revenueLow - y.totalCostHigh,
    ebitdaHigh: y.revenueHigh - y.totalCostLow,
  }));
}
