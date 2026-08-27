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
  revenuePerCustomerMonth,
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
  /**
   * The sum of `customersAtMonth` across the year's twelve months — customer-months, the
   * monthly integral of the ramp.
   *
   * It is the one quantity a year-end figure cannot reconstruct. Every revenue and serve-cost
   * row below is `customerMonths` times a per-customer-per-month rate, so a formula that
   * multiplied year-end customers by twelve would overstate every ramping year, and one that
   * multiplied the year's average would need the ramp back again to compute the average.
   *
   * That is why the workbook emits this as a CACHED value per metro-year and derives
   * `campaigns`, `gmv`, `subscriptionRevenue`, `takeRateRevenue` and `serveCost` from it as
   * live formulas. It is the anchor: the smallest thing that has to be carried across from
   * the model for the rest of the sheet to be arithmetic a reader can check.
   */
  readonly customerMonths: number;
  readonly campaigns: number;
  readonly gmv: number;
  readonly subscriptionRevenue: number;
  readonly takeRateRevenue: number;
  /**
   * Revenue BOOKED during the year: summed month by month while customers are still ramping.
   * This is what the metro actually invoices between January and December.
   *
   * It is NOT annual recurring revenue and the two must never be compared. See `exitArr`.
   */
  readonly revenue: number;
  /**
   * Annual recurring revenue at the EXIT of the year: customers at year end, at the
   * registered mix, running for twelve months. A run-rate, not a sum of what happened.
   *
   * Both quantities are carried because the model needs both and they differ by a real
   * mechanism, not by rounding. `revenue` is depressed by the ramp -- a metro that ends the
   * year with 65 customers spent most of it with far fewer -- so booked revenue is
   * materially BELOW exit ARR in every growth year, and the faster the growth the wider the
   * gap. PROJECT_CONTEXT section 3's targets are stated as ARR, so the cross-check in
   * `rollup.ts` compares against THIS field. Confusing the two is the same class of error as
   * labelling metro contribution "EBITDA": two figures that look comparable, differ by a
   * real mechanism, and get conflated because nobody computed both.
   */
  readonly exitArr: number;
  readonly stripeCost: number;
  readonly serveCost: number;
  readonly costOfRevenue: number;
  readonly grossProfit: number;
  readonly marketingCost: number;
  readonly metroEbitda: number;
}

export interface MetroKpis {
  readonly grossMarginPct: number;
  readonly marketingPctOfRevenue: number;
  readonly costOfRevenuePctOfRevenue: number;
}

/**
 * The three ratio KPIs shown under each metro's "KPIs" block. Extracted so the workbook and
 * `workbookProvenance.test.ts` share one computation rather than each re-deriving the same
 * ratio from `MetroYear` fields — two copies of a formula is how they'd drift apart.
 */
export function metroKpis(y: Pick<MetroYear, 'revenue' | 'grossProfit' | 'marketingCost' | 'costOfRevenue'>): MetroKpis {
  const shareOfRevenue = (numerator: number) => (y.revenue === 0 ? 0 : numerator / y.revenue);
  return {
    grossMarginPct: shareOfRevenue(y.grossProfit),
    marketingPctOfRevenue: shareOfRevenue(y.marketingCost),
    costOfRevenuePctOfRevenue: shareOfRevenue(y.costOfRevenue),
  };
}

/**
 * The CAC charged per gross add: the midpoint of the registered low/high band.
 *
 * Extracted from `projectMetroYear`'s local so the workbook's `ue_cac` cell can cache the
 * same number it emits a formula for, rather than re-deriving the midpoint a second time.
 */
export function blendedCac(): number {
  return (UNIT_ECONOMICS.restaurantCacLow.value + UNIT_ECONOMICS.restaurantCacHigh.value) / 2;
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
  const marketingCost = grossAdds * blendedCac();

  return {
    metroId,
    year,
    addressableVenues: addressableVenues(metroId),
    penetrationAtYearEnd: penetrationAtMonth(metroId, lastMonth),
    customersAtYearStart,
    customersAtYearEnd,
    grossAdds,
    customerMonths,
    campaigns,
    gmv,
    subscriptionRevenue,
    takeRateRevenue,
    revenue,
    // Derived from `revenuePerCustomerMonth` rather than by re-multiplying subscription and
    // take rate here, so ARPU has exactly one definition in the model.
    exitArr: customersAtYearEnd * revenuePerCustomerMonth(mix) * MONTHS_PER_YEAR,
    stripeCost,
    serveCost,
    costOfRevenue,
    grossProfit,
    marketingCost,
    metroEbitda: grossProfit - marketingCost,
  };
}
