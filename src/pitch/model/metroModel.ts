/**
 * One metro, one year. Pure — no dates, no I/O.
 *
 * Adrian's per-state sheet computes revenue as market size times market share, then walks a
 * cost stack down to a local EBITDA. This is the same walk with our own rows. Three of his
 * blocks have no analogue here and are omitted rather than stubbed: promotional bonus costs
 * (we discount nothing), statutory gaming tax, and market-access fees to a licence holder.
 *
 * Revenue is summed MONTHLY rather than computed off an annual average, because a metro that
 * launches mid-year earns nothing for the months before it opens and an annual figure hides
 * that. Hoboken launches in month 1 and Palm Beach in month 12, so the difference is real.
 */
import { MODEL_YEARS, METROS, addressableVenues, type ModelYear } from './metros';
import {
  avgCampaignValue,
  blendedSubscription,
  blendedTakeRate,
  type TierMix,
} from './project';
import { MARKET, UNIT_ECONOMICS } from './assumptions';

export const MONTHS_PER_YEAR = 12;

export interface MetroYear {
  readonly metroId: string;
  readonly year: ModelYear;
  readonly addressableVenues: number;
  readonly penetrationAtYearEnd: number;
  readonly customersAtYearStart: number;
  readonly customersAtYearEnd: number;
  /** New customers signed during the year, including replacements for churn. */
  readonly grossAdds: number;
  readonly campaigns: number;
  readonly gmv: number;
  readonly subscriptionRevenue: number;
  readonly takeRateRevenue: number;
  readonly revenue: number;
  readonly stripeCost: number;
  readonly serveCost: number;
  readonly costOfRevenue: number;
  readonly grossProfit: number;
  readonly marketingCost: number;
  readonly metroEbitda: number;
}

function metroById(metroId: string) {
  const found = METROS.find((m) => m.id === metroId);
  if (!found) throw new Error(`Unknown metro "${metroId}".`);
  return found;
}

/**
 * Penetration at an absolute month, interpolated linearly between the registered year-end
 * anchors. Zero before launch. A metro launching after a year end simply has no anchor
 * there, so the ramp starts from its launch month to the next anchor it does have.
 */
export function penetrationAtMonth(metroId: string, month: number): number {
  const m = metroById(metroId);
  const launch = m.launchMonth.value;
  if (month < launch) return 0;

  const anchors: Array<{ month: number; pen: number }> = [{ month: launch, pen: 0 }];
  MODEL_YEARS.forEach((y, i) => {
    const anchorMonth = (i + 1) * MONTHS_PER_YEAR;
    if (anchorMonth > launch) anchors.push({ month: anchorMonth, pen: m.penetration[y].value });
  });

  if (month >= anchors[anchors.length - 1].month) return anchors[anchors.length - 1].pen;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (month >= a.month && month <= b.month) {
      const span = b.month - a.month;
      if (span === 0) return b.pen;
      return a.pen + ((month - a.month) / span) * (b.pen - a.pen);
    }
  }
  return 0;
}

export function customersAtMonth(metroId: string, month: number): number {
  return Math.round(addressableVenues(metroId) * penetrationAtMonth(metroId, month));
}

export function projectMetroYear(metroId: string, year: ModelYear, mix: TierMix): MetroYear {
  const yearIndex = MODEL_YEARS.indexOf(year);
  if (yearIndex < 0) throw new Error(`Year ${year} is outside the model horizon.`);

  const firstMonth = yearIndex * MONTHS_PER_YEAR + 1;
  const lastMonth = firstMonth + MONTHS_PER_YEAR - 1;

  // firstMonth is 1, 13, 25 for the three model years, so firstMonth - 1 is 0, 12, 24 — never
  // negative. No `|| 0` fallback needed; one would be a no-op that reads like a guard.
  const customersAtYearStart = customersAtMonth(metroId, firstMonth - 1);
  const customersAtYearEnd = customersAtMonth(metroId, lastMonth);

  const subPerCustomer = blendedSubscription(mix);
  const takeRate = blendedTakeRate(mix);
  const campaignValue = avgCampaignValue();
  const campaignsPerCustomer = MARKET.campaignsPerRestaurantPerMonth.value;

  let campaigns = 0;
  let gmv = 0;
  let subscriptionRevenue = 0;
  let customerMonths = 0;

  for (let month = firstMonth; month <= lastMonth; month += 1) {
    const customers = customersAtMonth(metroId, month);
    const monthCampaigns = customers * campaignsPerCustomer;
    campaigns += monthCampaigns;
    gmv += monthCampaigns * campaignValue;
    subscriptionRevenue += customers * subPerCustomer;
    customerMonths += customers;
  }

  const takeRateRevenue = gmv * takeRate;
  const revenue = subscriptionRevenue + takeRateRevenue;

  // Stripe is charged on the full amount moving through the platform and recovered inside
  // the take rate, so it is a cost of revenue rather than an infrastructure line.
  const stripeCost =
    gmv * UNIT_ECONOMICS.stripePctFee.value + campaigns * UNIT_ECONOMICS.stripeFixedFee.value;
  const serveCost =
    customerMonths *
    (UNIT_ECONOMICS.aiCostPerCustomerMonth.value + UNIT_ECONOMICS.infraCostPerCustomerMonth.value);
  const costOfRevenue = stripeCost + serveCost;
  const grossProfit = revenue - costOfRevenue;

  // Marketing is charged on GROSS adds, not net growth. A customer who churns and is
  // replaced costs a second CAC, and a model that charges only net growth understates
  // marketing by exactly the churn rate — which is the number the kill-switch watches.
  const monthlyChurn = UNIT_ECONOMICS.monthlyChurn.value;
  let churned = 0;
  for (let month = firstMonth; month <= lastMonth; month += 1) {
    churned += customersAtMonth(metroId, month - 1) * monthlyChurn;
  }
  const grossAdds = Math.max(0, customersAtYearEnd - customersAtYearStart + churned);
  const cac = (UNIT_ECONOMICS.restaurantCacLow.value + UNIT_ECONOMICS.restaurantCacHigh.value) / 2;
  const marketingCost = grossAdds * cac;

  return {
    metroId,
    year,
    addressableVenues: addressableVenues(metroId),
    penetrationAtYearEnd: penetrationAtMonth(metroId, lastMonth),
    customersAtYearStart,
    customersAtYearEnd,
    grossAdds,
    campaigns,
    gmv,
    subscriptionRevenue,
    takeRateRevenue,
    revenue,
    stripeCost,
    serveCost,
    costOfRevenue,
    grossProfit,
    marketingCost,
    metroEbitda: grossProfit - marketingCost,
  };
}
