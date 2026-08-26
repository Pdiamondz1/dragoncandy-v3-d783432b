/**
 * Every metro, summed. Adrian's `Totals` sheet, as a function -- minus the shared-cost line.
 *
 * **This file is deliberately free of `./confidential`.** Company-level shared cost, its
 * allocation across metros and the resulting consolidated EBITDA live in `consolidated.ts`,
 * because they are computed from the pre-seed budget and the budget must not enter a public
 * bundle's module graph. Everything here -- revenue, gross profit, marketing, metro EBITDA,
 * metros live, the top-down band -- depends on nothing confidential, so a deck slide may
 * import it directly. See `consolidated.ts`'s header for why the split is by dependency
 * rather than by consumer, and why pointing this file at `@pitch/confidential` instead would
 * have silently zeroed shared cost under vitest.
 *
 * The top-down band from PROJECT_CONTEXT section 3 travels alongside the bottom-up build as
 * a cross-check. They are expected to disagree. See the spec, section 10: the gap is
 * reported and never closed, because tuning penetration until they match is fitting the
 * assumptions to a desired answer.
 */
import { modeled, type Assumption } from './types';
import { MODEL_YEARS, enabledMetros, type ModelYear } from './metros';
import { projectMetroYear, type MetroYear } from './metroModel';
import { REGISTERED_MIX, type TierMix } from './project';
import { threeYearTrajectory } from './derive';

export const COHORT_METRO_ID = 'cohort';

const SOURCE = 'src/pitch/model/rollup.ts';

/**
 * Metros beyond the three named ones. PROJECT_CONTEXT section 3 targets 2-3 metros in Y1,
 * 8-12 in Y2 and 20+ in Y3, but those metros have not been chosen — so they are modeled as
 * a count of average metros rather than as invented named cities.
 */
export const COHORT_METRO_COUNTS: Readonly<Record<ModelYear, Assumption<number>>> = {
  2026: modeled({ value: 0, unit: 'metros', label: 'Additional metros 2026', source: SOURCE }),
  2027: modeled({ value: 6, unit: 'metros', label: 'Additional metros 2027', source: SOURCE }),
  2028: modeled({ value: 17, unit: 'metros', label: 'Additional metros 2028', source: SOURCE }),
};

export interface RollupYear {
  readonly year: ModelYear;
  readonly metros: readonly MetroYear[];
  readonly revenue: number;
  readonly grossProfit: number;
  readonly marketingCost: number;
  /**
   * The metros' own EBITDA, BEFORE company-level shared costs. This is not the company's
   * EBITDA and must never be labelled as such -- see `ConsolidatedYear.ebitda`.
   */
  readonly metroEbitda: number;
  /**
   * Count of actual metros with a live customer relationship at year end -- NOT a count
   * of rollup rows. Named metros count 1 each; the cohort row counts as
   * `COHORT_METRO_COUNTS[year].value` (the metros it stands in for) when it has revenue,
   * 0 otherwise -- never as a single row. A row-count definition would read "4" for
   * 2027/2028 while the model books revenue for 3 named metros plus 6 or 17 cohort
   * metros, which is an investor-facing misstatement once this renders on a deck slide
   * as "N metros".
   */
  readonly metrosLive: number;
  readonly topDownRevenueLow: number;
  readonly topDownRevenueHigh: number;
  /** Bottom-up revenue as a multiple of the top-down band's midpoint. 1.0 means agreement. */
  readonly bottomUpVsTopDown: number;
}

/**
 * The later metros, as `count` copies of Hoboken's shape for that year — the FIRST named
 * metro, not an average of the three. Averaging Hoboken, Manhattan and Palm Beach would be a
 * second modeling decision the spec does not authorise (they launch in different months
 * against different TAM sizes), and inventing one mid-implementation is worse than a
 * template that states plainly what it is. This understates a cohort that in reality
 * contains any metro larger than Hoboken — Manhattan's addressable TAM alone is many times
 * Hoboken's — so the 2027/2028 cohort figures below should be read as a floor, not a
 * best estimate.
 */
export function cohortMetroYear(year: ModelYear, mix: TierMix): MetroYear {
  const count = COHORT_METRO_COUNTS[year].value;
  const named = enabledMetros();
  const template = projectMetroYear(named[0].id, year, mix);

  if (count === 0) {
    return {
      ...template,
      metroId: COHORT_METRO_ID,
      customersAtYearStart: 0,
      customersAtYearEnd: 0,
      grossAdds: 0,
      campaigns: 0,
      gmv: 0,
      subscriptionRevenue: 0,
      takeRateRevenue: 0,
      revenue: 0,
      stripeCost: 0,
      serveCost: 0,
      costOfRevenue: 0,
      grossProfit: 0,
      marketingCost: 0,
      metroEbitda: 0,
    };
  }

  const scale = (v: number) => v * count;
  return {
    ...template,
    metroId: COHORT_METRO_ID,
    customersAtYearStart: scale(template.customersAtYearStart),
    customersAtYearEnd: scale(template.customersAtYearEnd),
    grossAdds: scale(template.grossAdds),
    campaigns: scale(template.campaigns),
    gmv: scale(template.gmv),
    subscriptionRevenue: scale(template.subscriptionRevenue),
    takeRateRevenue: scale(template.takeRateRevenue),
    revenue: scale(template.revenue),
    stripeCost: scale(template.stripeCost),
    serveCost: scale(template.serveCost),
    costOfRevenue: scale(template.costOfRevenue),
    grossProfit: scale(template.grossProfit),
    marketingCost: scale(template.marketingCost),
    metroEbitda: scale(template.metroEbitda),
  };
}

export function rollup(mix: TierMix = REGISTERED_MIX, metroIds?: readonly string[]): RollupYear[] {
  const selected = enabledMetros().filter((m) => !metroIds || metroIds.includes(m.id));
  const topDown = threeYearTrajectory();

  return MODEL_YEARS.map((year, i) => {
    const metros = [
      ...selected.map((m) => projectMetroYear(m.id, year, mix)),
      cohortMetroYear(year, mix),
    ];
    const revenue = metros.reduce((s, m) => s + m.revenue, 0);
    const grossProfit = metros.reduce((s, m) => s + m.grossProfit, 0);
    const marketingCost = metros.reduce((s, m) => s + m.marketingCost, 0);
    const metroEbitda = metros.reduce((s, m) => s + m.metroEbitda, 0);
    const band = topDown[i];
    const midpoint = (band.revenueLow + band.revenueHigh) / 2;

    return {
      year,
      metros,
      revenue,
      grossProfit,
      marketingCost,
      metroEbitda,
      metrosLive:
        metros.filter((m) => m.metroId !== COHORT_METRO_ID && m.customersAtYearEnd > 0).length +
        (metros.find((m) => m.metroId === COHORT_METRO_ID)!.revenue > 0
          ? COHORT_METRO_COUNTS[year].value
          : 0),
      topDownRevenueLow: band.revenueLow,
      topDownRevenueHigh: band.revenueHigh,
      bottomUpVsTopDown: midpoint === 0 ? 0 : revenue / midpoint,
    };
  });
}
