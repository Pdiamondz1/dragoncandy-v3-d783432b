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
 * Metros beyond the four named ones. PROJECT_CONTEXT section 3 targets 2-3 metros in Y1,
 * 8-12 in Y2 and 20+ in Y3, but those metros have not been chosen — so they are modeled as
 * a count of metros shaped like the template below, rather than as invented named cities.
 * Four named plus 17 is 21, which is how "20+ metros" is reached by counting.
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
   * 0 otherwise -- never as a single row. A row-count definition would read "5" for
   * 2027/2028 while the model books revenue for 4 named metros plus 6 or 17 cohort
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
 * The metro whose shape the unnamed later metros are scaled from.
 *
 * Named explicitly rather than taken as `named[0]`. Positional selection is fragile — a
 * registry reorder would silently change the whole model's largest revenue line, with no
 * diff on this file — and it also picked the WRONG metro, in two directions at once.
 *
 * `named[0]` was Hoboken, and using Hoboken as the template for a "metro" is a category
 * error twice over:
 *
 *   1. Hoboken is a one-square-mile TOWN of 123 addressable venues. It is why 17 metros
 *      produced a smaller customer base than Manhattan alone — an arithmetic result that
 *      should have been read as a broken premise rather than as conservatism.
 *   2. Hoboken's 2028 penetration is 35% — the founders' HOME TOWN rate, where they know
 *      the owners by name. Applying it to 17 cities nobody has entered was the single most
 *      aggressive assumption in the model, and it was hiding inside a total that read
 *      conservative because the base it multiplied was so small.
 *
 * Palm Beach County is the right template because nothing about it is invented: it is a
 * real, already-registered metro with real Census counts (1,090 addressable venues) and a
 * 6% 2028 ramp appropriate to a metro ENTERED IN MONTH 12 by a team with no presence there
 * — which is exactly the situation every cohort metro is in. No new number enters the model
 * to make this change; one existing metro replaces another as the reference.
 *
 * The cohort COUNT is untouched (2026: 0, 2027: 6, 2028: 17). "How many metros" is a
 * separately registered assumption with its own source; "what is a metro" is a different
 * question, and answering the second is not licence to restate the first.
 */
export const COHORT_TEMPLATE_METRO_ID = 'palm-beach';

/**
 * The later metros, as `count` copies of the template metro's shape for that year — a single
 * named metro, not an average of the four. Averaging them would be a second modeling
 * decision the spec does not authorise (they launch in different months against wildly
 * different TAM sizes), and inventing one mid-implementation is worse than a template that
 * states plainly what it is.
 *
 * The direction of the residual bias is worth stating, because it changed with the template.
 * Against Hoboken this was described as a floor; against Palm Beach County it is neither a
 * floor nor a ceiling. A cohort of 17 unentered metros contains places larger than Palm
 * Beach County and places much smaller, and we do not know the mix — so this is a
 * mid-sized reference case, and the honest claim is that it is defensible, not that it is
 * cautious.
 */
export function cohortMetroYear(year: ModelYear, mix: TierMix): MetroYear {
  const count = COHORT_METRO_COUNTS[year].value;
  // The template must be a live metro. If it is ever disabled or renamed, this fails loudly
  // rather than scaling 17 copies of a metro the rollup no longer reports -- the silent
  // version of the same class of bug positional selection would have caused.
  if (!enabledMetros().some((m) => m.id === COHORT_TEMPLATE_METRO_ID)) {
    throw new Error(
      `The cohort template metro "${COHORT_TEMPLATE_METRO_ID}" is not an enabled metro, so ` +
        `the ${count}-metro cohort would be scaled from a metro the model does not report. ` +
        `Pick a new template in rollup.ts and say why, rather than letting this pass.`,
    );
  }
  const template = projectMetroYear(COHORT_TEMPLATE_METRO_ID, year, mix);

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
