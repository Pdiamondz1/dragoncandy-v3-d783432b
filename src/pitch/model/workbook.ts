/**
 * The workbook, as data. `exceljs` never appears here — the writer is a separate script.
 *
 * Keeping the sheet contents as plain cells means a test can walk every cell and assert
 * that no number arrived without provenance (see workbookProvenance.test.ts), which is the
 * control that turns "no made-up numbers" from a promise into a failing build.
 */
import { REGISTER } from './assumptions';
import {
  METRO_ASSUMPTIONS,
  METROS,
  MODEL_YEARS,
  addressableVenues,
  addressableBand,
  describeAddressable,
  totalFoodServiceVenues,
  ADDRESSABLE_NAICS,
  ADDRESSABLE_BUCKETS,
  enabledMetros,
} from './metros';
import { loadCensusSnapshot, snapshotFor } from './censusTam';
import { projectMetroYear, metroKpis, blendedCac, MONTHS_PER_YEAR } from './metroModel';
import {
  rollup,
  COHORT_METRO_COUNTS,
  COHORT_METRO_ID,
  COHORT_TEMPLATE_METRO_ID,
} from './rollup';
import { consolidated, sharedCostForYear } from './consolidated';
import {
  REGISTERED_MIX,
  TIERS,
  avgCampaignValue,
  blendedSubscription,
  blendedTakeRate,
  revenuePerCustomerMonth,
} from './project';
import { unitEconomics } from './derive';
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  budgetTotal,
  preSeedRaise,
  buildFundsAllocation,
  USE_OF_FUNDS_SPLIT,
  CONFIDENTIAL_ASSUMPTIONS,
} from './confidential';
import type { Assumption } from './types';

/**
 * What a cell IS, not what it looks like. The writer turns these into fonts and fills
 * (`scripts/lib/workbook-theme.ts`); nothing here knows a colour.
 *
 * Keeping the tag semantic is what lets the spec stay walkable data. A cell carrying
 * `fill: 'FF0F766E'` would be a presentation decision frozen into the model, and the next
 * person wanting a different look would have to edit the model to get it. A cell carrying
 * `role: 'section'` is a statement about the document's structure that stays true in any
 * theme, in a PDF, or in a renderer that has no colours at all.
 *
 * A role on the FIRST cell of a row governs the whole row — that is why tagging the metro
 * sheets costs a dozen edits rather than a hundred. A role on any other cell governs just
 * that cell and wins over the row's.
 */
export type CellRole =
  /** The sheet's own name, row 1 column A. */
  | 'title'
  /** The line under a title — provenance, vintage, scope. */
  | 'subtitle'
  /** A column heading: the year row, the Assumptions header. */
  | 'header'
  /** A band opening a group of rows: `Market`, `Revenue`, `Cost of revenue`. */
  | 'section'
  /** Prose. Rendered muted and merged across the sheet so it reads as a sentence. */
  | 'note'
  /** A cell the reader is INVITED to change. The only ones in the workbook. */
  | 'input'
  /** A subtotal — `Total revenue`, `Total cost of revenue`. */
  | 'total'
  /** The number the row exists to produce: `Metro EBITDA`, `Exit ARR`, `Raise`. */
  | 'headline'
  /** A provenance tag (`MEASURED` / `MODELED` / `BENCHMARKED`), coloured by its value. */
  | 'provenance';

export interface Cell {
  readonly v: string | number | null;
  /** Excel formula, without the leading `=`. Task 7 fills these in. */
  readonly f?: string;
  /** Defined name for this cell, so formulas elsewhere can reference it by name. */
  readonly name?: string;
  /** Excel number format, e.g. `'$#,##0'` or `'0.0%'`. */
  readonly fmt?: string;
  /** What this cell is. Presentation only — never read by a formula or a total. */
  readonly role?: CellRole;
}

export type CellRow = readonly Cell[];

export interface SheetSpec {
  readonly name: string;
  readonly rows: readonly CellRow[];
}

export const FINANCING_SHEET = 'Financing';

/**
 * The shared-cost allocation sheet — CONFIDENTIAL, and gated out of the public workbook the
 * same way `FINANCING_SHEET` is.
 *
 * `Total shared cost` IS the pre-seed budget, annualised (`sharedCostForYear` sums the same
 * `PRE_SEED_BUDGET` the Financing sheet itemises), and the allocation block below it is that
 * total split per metro. So publishing this sheet publishes the budget total and its shape
 * while the Financing sheet that states it outright is withheld — the gate protecting one
 * number by name, and the same number arriving under a different label.
 */
export const SHARED_COSTS_SHEET = 'Shared_Costs';

export const SHEET_ORDER = [
  'README',
  'Assumptions',
  'Sources',
  'Hoboken_Model',
  'Manhattan_Model',
  'PalmBeach_Model',
  'MontaukHamptons_Model',
  'Metros_4toN',
  SHARED_COSTS_SHEET,
  'Totals',
  'Unit_Economics',
  FINANCING_SHEET,
] as const;

/** Sheets that exist only in the confidential workbook. */
export const CONFIDENTIAL_SHEETS = [SHARED_COSTS_SHEET, FINANCING_SHEET] as const;

/**
 * Row labels that must never reach a public workbook.
 *
 * These are LABELS, not values, and that is what makes them checkable: a label is
 * distinctive where `775884` could plausibly be an unrelated constant. Every one of them
 * introduces a company-level cost figure derived from the confidential budget —
 * `Total shared cost` and `Allocation` on the Shared_Costs sheet, `Shared cost` and the
 * consolidated `EBITDA` row on Totals.
 *
 * `Metro EBITDA` is deliberately NOT here and must not be added: it is the metros' own
 * contribution, computed entirely from the metro sheets, and it is the figure the public
 * deck already shows. The two labels differ by one word and by the whole shared-cost line.
 */
export const PUBLIC_FORBIDDEN_ROW_LABELS = [
  'Shared cost',
  'Total shared cost',
  'Allocation',
  'EBITDA',
] as const;

const t = (v: string): Cell => ({ v });
const n = (v: number, fmt = '$#,##0'): Cell => ({ v, fmt });
const pct = (v: number): Cell => ({ v, fmt: '0.0%' });
const blank: Cell = { v: null };

/**
 * Role-carrying builders. Each is `t` plus a tag, so a row reads as what it is:
 * `sec('Revenue')` rather than `t('Revenue')` and a note in the writer about which strings
 * happen to be headings. The alternative — inferring structure in the writer from the shape
 * of a row — was rejected because a prose row and a section heading are the same shape (one
 * string in column A, nothing beside it), and a rule that cannot tell them apart formats
 * every explanatory paragraph as a heading.
 */
const title = (v: string): Cell => ({ v, role: 'title' });
const sub = (v: string): Cell => ({ v, role: 'subtitle' });
const hdr = (v: string): Cell => ({ v, role: 'header' });
const sec = (v: string): Cell => ({ v, role: 'section' });
const note = (v: string): Cell => ({ v, role: 'note' });
const tot = (v: string): Cell => ({ v, role: 'total' });
const key = (v: string): Cell => ({ v, role: 'headline' });

/**
 * The defined name a registered assumption is published under, and the ONLY way a formula
 * should ever spell one. Definition and reference both call this, so they cannot drift.
 *
 * The sanitisation is not cosmetic. Metro ids carry a hyphen (`palm-beach`,
 * `montauk-hamptons`), and a hyphen is illegal in an Excel defined name; worse, the formula
 * tokenizer in formulaEval.ts would read `asm_palm-beach_penetration_2026` as `asm_palm`
 * MINUS `beach_penetration_2026` — a formula that parses, resolves nothing, and throws at
 * evaluation. Two of the four metros are affected, so the first reference to a penetration
 * cell would have failed.
 */
function asmName(key: string): string {
  return `asm_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/**
 * Named cells on Unit_Economics holding quantities that are DERIVED from the tier mix and
 * pricing rather than registered as assumptions. See `unitEconomicsSheet`.
 */
const UE = {
  blendedSubscription: 'ue_blendedSubscription',
  blendedTakeRate: 'ue_blendedTakeRate',
  avgCampaignValue: 'ue_avgCampaignValue',
  arpuPerCustomerMonth: 'ue_arpuPerCustomerMonth',
  cac: 'ue_cac',
} as const;

const SHEET_BY_METRO: Readonly<Record<string, string>> = {
  hoboken: 'Hoboken_Model',
  manhattan: 'Manhattan_Model',
  'palm-beach': 'PalmBeach_Model',
  'montauk-hamptons': 'MontaukHamptons_Model',
};

/**
 * `confidentialAssumptions` is included only for the confidential build. The Assumptions sheet
 * ships in BOTH builds, so putting founder salaries / use-of-funds shares here unconditionally
 * would leak them into the public workbook the same way `FINANCING_SHEET` is gated instead.
 */
function assumptionRows(confidential: boolean): CellRow[] {
  const all: Array<[string, Assumption<number>]> = [
    ...Object.entries(REGISTER),
    ...Object.entries(METRO_ASSUMPTIONS),
    ...MODEL_YEARS.map((y) => [`cohortMetros_${y}`, COHORT_METRO_COUNTS[y]] as [string, Assumption<number>]),
    ...(confidential ? Object.entries(CONFIDENTIAL_ASSUMPTIONS) : []),
  ];
  return all.map(([key, a]) => [
    t(key),
    t(a.label),
    { v: a.value, name: asmName(key), fmt: assumptionFormat(a.unit), role: 'input' as const },
    { v: a.provenance, role: 'provenance' as const },
    t(a.source),
    t(a.provenance === 'MEASURED' ? a.asOf : ''),
    t(a.unit),
    t(a.note ?? ''),
  ]);
}

/**
 * How an assumption's value should READ, decided from its registered unit.
 *
 * These cells shipped with no number format at all, so the sheet a reader is told to edit
 * showed `0.029` for a 2.9% fee and `0.005` for a half-percent penetration — the two figures
 * most likely to be mistyped by an order of magnitude, displayed in the form that makes the
 * mistake invisible. A percent format also makes the edit natural: typing `8%` into a
 * percent-formatted cell stores 0.08, where typing it into a General cell stores text.
 *
 * `calendar` is special-cased ahead of the numeric fallback, because 2026 is a year and
 * `#,##0` renders it `2,026`. Everything else falls through to a format that shows a decimal
 * only when there is one, so `2.5` stays 2.5 and `3228` reads 3,228.
 */
function assumptionFormat(unit: string): string {
  if (unit.includes('fraction')) return '0.00%';
  if (unit.startsWith('USD')) return '$#,##0.00';
  if (unit.includes('calendar')) return '0';
  return '#,##0.###';
}

/**
 * `confidential` reaches this sheet for one reason: the list of deliberately-plain values
 * below names `Shared cost`, and that row exists only in the confidential workbook. A README
 * that explains a row the reader cannot find is worse than one line shorter — and the label
 * itself is on `PUBLIC_FORBIDDEN_ROW_LABELS`, so leaving it here would make the README the
 * one place the public workbook still says it.
 */
function readmeSheet(confidential: boolean): SheetSpec {
  return {
    name: 'README',
    rows: [
      [title('DragonCandy — three-year financial model')],
      [sub('Generated by `npm run model:xlsx`. Do not edit by hand; the next run overwrites it.')],
      [blank],
      // This paragraph has been wrong in both directions and the history is worth keeping.
      // It first said "Every input lives on the Assumptions sheet as a named cell ... Nothing
      // else holds a raw number", which was never true. It was corrected to a smaller claim —
      // and the smaller claim was ALSO not true, because no formula referenced a named cell at
      // all: the whole Assumptions sheet was inert, and "change one and the model reflows" was
      // advice that did nothing. So state the mechanism and then name every exception, because
      // a reader who checks one claim and finds it false stops trusting the sheets that work.
      [note('Pricing, the tier mix, campaign volume and value, Stripe and serving costs, CAC, the')],
      [note('per-metro penetrations and the cohort metro count are named cells on the Assumptions')],
      [note('sheet, and the metro sheets, the cohort sheet and the Totals rollup are formulas over')],
      [note('them. Change one and the numbers that depend on it recalculate. Unit_Economics holds')],
      [note('the blends derived from those cells (ARPU, blended take rate, average campaign value,')],
      [note('CAC) — also formulas, so they move too.')],
      [blank],
      [sec(
        `${confidential ? 'FOUR' : 'THREE'} THINGS ARE DELIBERATELY PLAIN VALUES, ` +
          'and each says so where it appears:',
      )],
      [note('  Customer-months — the sum of customers across a year’s twelve months. The monthly')],
      [note('    ramp is not on the sheet, so this cannot be recomputed from a year-end figure.')],
      [note('  Gross adds — the same, for churn replaced month by month.')],
      [note('  Addressable venues — a Census count (see Sources), not an assumption to edit.')],
      ...(confidential
        ? [[note('  Shared cost — company-level, from outside the metro sheets entirely.')]]
        : []),
      [note('Because customer-months is fixed, editing a PENETRATION moves customers at year end')],
      [note('and Exit ARR but not booked revenue. Re-run `npm run model:xlsx` after such an edit.')],
      [blank],
      [note('Provenance: MEASURED = read off production, an invoice or the codebase on the stated')],
      [note('date, with the command that re-reads it. BENCHMARKED = an external comparable, with a')],
      [note('URL. MODELED = ours, with the driver named. See the Assumptions and Sources sheets.')],
      [blank],
      [note('Toggle a metro in or out with the YES/NO cells on Totals.')],
    ],
  };
}

function sourcesSheet(): SheetSpec {
  const snap = loadCensusSnapshot();
  const rows: CellRow[] = [
    [title('Sources')],
    [blank],
    [sec('Market size — US Census Business Patterns')],
    [t('NAICS in the addressable band'), t(ADDRESSABLE_NAICS.join(', '))],
    [t('Employment-size buckets'), t(ADDRESSABLE_BUCKETS.join(', '))],
    [t('Excluded: 722513 limited-service'), t('franchised fast food — social is set at corporate, not by the location')],
    [t('Excluded: 7223 special food services'), t('catering and food trucks — no fixed venue to market')],
    [t('Excluded: under 5 employees'), t('below the $149 entry tier’s plausible budget')],
    [t('Excluded: 50+ employees'), t('has, or is owned by someone who has, a marketing function')],
    [blank],
  ];
  for (const m of snap.metros) {
    rows.push([t(m.metroId), t(m.geography.label), t(`vintage ${m.vintage}`), t(m.sourceUrl), t(`fetched ${m.fetchedAt}`)]);
    // Written, not printed as a bare number: where the count is a floor this is the only
    // place a reader learns it. `describeAddressable` owns the wording for every surface.
    rows.push([blank, t(describeAddressable(m.metroId))]);
    if (m.parts) {
      const answered = m.parts.filter((p) => p.rows.length > 0).length;
      rows.push([
        blank,
        t(
          `${m.parts.length} constituent ZIPs, of which ${answered} appear in the ZBP at all. ` +
            `The rest are ABSENT, which is not the same as zero and is recorded rather than dropped:`,
        ),
      ]);
      for (const p of m.parts) {
        const row722 = p.rows.find((r) => r.naics === '722');
        rows.push([
          blank,
          t(`${p.code} ${p.label}`),
          t(row722 ? `${row722.establishments} food service venues` : 'ABSENT — no ZBP rows'),
        ]);
      }
    }
  }
  rows.push(
    [blank],
    [sec('Census suppression')],
    [note('Cells marked "N" are suppressed to protect respondent confidentiality. They are treated')],
    [note('as unknown, never as zero. A bucket forced by the establishment total is recovered as')],
    [note('the residual; where more than one is suppressed the model states a range.')],
    [note('ON THIS 2023 VINTAGE NOTHING IS RECOVERABLE, and we would rather you read that here than')],
    [note('find it yourself. A bucket is forced only when exactly one of a row’s nine is unknown.')],
    [note('Across all 67 rows in our snapshot the fewest any row has is TWO — the distribution runs')],
    [note('2 to 9 — so ZERO rows qualify and the recovery step changes no number in this workbook.')],
    [note('Every addressable count here is therefore a floor, and "suppressed cells" is the whole')],
    [note('story. The recovery step is kept because a later vintage or a narrower geography can')],
    [note('produce a one-unknown row; it runs PER GEOGRAPHY and BEFORE any summing, since summing')],
    [note('first would pool several rows’ unknowns and lose a recoverable bucket for nothing.')],
    [note('Across a SET of ZIPs the addressable count is then a FLOOR — the sum of what is known —')],
    [note('rather than a refusal. Refusing is right for one geography (a hidden cell means the metro')],
    [note('is not modelable, which is why Palm Beach moved from the town ZIP to the county); across')],
    [note('fourteen ZIPs it would make a real market unmodelable over one hidden count in one hamlet.')],
    [note('The bias is bounded, one-directional and stated: it can only UNDERSTATE, never overstate.')],
    [blank],
    [sec('Rows in Adrian’s model that are OMITTED here, deliberately')],
    [t('Bonus costs'), t('no analogue — DragonCandy discounts nothing')],
    [t('Statutory gaming tax'), t('no analogue — not a gaming business')],
    [t('Market access fees'), t('no analogue — no licence holder takes a share')],
    [note('A row shaped like his but filled with an invented number would be worse than its absence.')],
    [blank],
    [note('Every other number traces to the Assumptions sheet, which carries its provenance and source.')],
  );
  return { name: 'Sources', rows };
}

/** This metro sheet's own year columns — label in A, so years land in B/C/D. */
const METRO_YEAR_COLS = ['B', 'C', 'D'] as const;

function metroSheet(metroId: string): SheetSpec {
  const snap = snapshotFor(loadCensusSnapshot(), metroId);
  const years = MODEL_YEARS.map((y) => projectMetroYear(metroId, y, REGISTERED_MIX));
  const label = METROS.find((m) => m.id === metroId)!.label;
  const sheetName = SHEET_BY_METRO[metroId];
  // Every reference is sheet-qualified, even these same-sheet ones — see formulaEval.ts's
  // header comment for why the evaluator requires that.
  const ref = (row: number, col: string) => `${sheetName}!${col}${row}`;

  const line = (
    name: string,
    pick: (y: (typeof years)[number]) => number,
    fmt?: string,
    role?: CellRole,
  ): CellRow => [
    { v: name, ...(role ? { role } : {}) },
    ...years.map((y) => (fmt === '0.0%' ? pct(pick(y)) : n(pick(y), fmt))),
  ];

  /**
   * The same row, but LIVE: the model's number as the cached value and a formula that must
   * reproduce it. `formulaAgreement.test.ts` checks every one of these, so a driver row that
   * is quietly converted back to a plain value loses its check silently — which is why the
   * assumption-reachability test in workbook.test.ts asserts the references exist by name.
   */
  const liveLine = (
    name: string,
    pick: (y: (typeof years)[number]) => number,
    formula: (i: number) => string,
    fmt = '$#,##0',
    role?: CellRole,
  ): CellRow => [
    { v: name, ...(role ? { role } : {}) },
    ...MODEL_YEARS.map((_, i) => ({ v: pick(years[i]), f: formula(i), fmt })),
  ];

  const col = (i: number) => METRO_YEAR_COLS[i];

  // Rows are pushed in order and their Excel row numbers (rows.length after each push)
  // captured as we go, so a formula can reference an earlier row without hardcoding its
  // index — the same discipline totalsSheet() below uses.
  const rows: CellRow[] = [
    [title(label), ...MODEL_YEARS.map((y) => hdr(String(y)))],
    [sub(`${snap.geography.label} — Census ${snap.vintage}`)],
    [blank],
    [sec('Market')],
    [t('Total food service venues'), ...years.map(() => n(totalFoodServiceVenues(metroId), '#,##0'))],
    // The disclosure rides in a trailing cell on the SAME row as the number, never on a row
    // of its own: a new row here would shift every row index below it, and totalsSheet()'s
    // REVENUE_ROW / EBITDA_ROW maps address this sheet by number. It is `describeAddressable`
    // that decides the wording, so no surface can print a floor as if it were a count.
    [
      t('Addressable venues'),
      ...years.map(() => n(addressableVenues(metroId), '#,##0')),
      // Two things ride in this trailing cell, on the SAME row as the number (a row of its own
      // would shift every index below it). First the suppression disclosure, where there is
      // one. Then, always, why this row is a plain value while the rows below it are live:
      // there is no assumption cell to point at. The count is derived from the Census
      // snapshot in censusTam.json by the NAICS/employment-size filter the Sources sheet
      // spells out — it is evidence, not a dial, and it is the one input a reader is not
      // invited to edit.
      note(
        (addressableBand(metroId).suppressedCells === 0 ? '' : `${describeAddressable(metroId)} `) +
          'Plain value, not a formula: this count comes from the Census snapshot (see Sources), ' +
          'not from an assumption cell, so there is nothing on the Assumptions sheet to reference.',
      ),
    ],
  ];
  const addressableRow = rows.length;
  // Live off the metro's own registered penetration anchor for that year. `penetrationAtMonth`
  // interpolates between anchors, and a year END is exactly an anchor month, so the two agree
  // by construction (Hoboken 2027 differs in the last bit of a double — 0.22000000000000003
  // against 0.22 — which is why the agreement test compares within a tolerance rather than
  // for equality).
  rows.push(
    liveLine(
      'Penetration of addressable',
      (y) => y.penetrationAtYearEnd,
      (i) => asmName(`${metroId}_penetration_${MODEL_YEARS[i]}`),
      '0.0%',
    ),
  );
  const penetrationRow = rows.length;

  // Customers at year end = ROUND(addressable * penetration, 0) — matches
  // `customersAtMonth`'s `Math.round`, which a plain product does not (they can differ by up
  // to ~0.4 for these metros). See formulaEval.ts's header comment.
  rows.push([
    t('Customers at year end'),
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].customersAtYearEnd,
      f: `ROUND(${ref(addressableRow, METRO_YEAR_COLS[i])}*${ref(penetrationRow, METRO_YEAR_COLS[i])},0)`,
      fmt: '#,##0',
    })),
  ]);

  const customersRow = rows.length;

  // The two MONTHLY INTEGRALS, and the only driver rows on this sheet that stay plain values.
  // Everything below is arithmetic over them, so they are where the model has to be trusted
  // and the rest is a reader's own multiplication.
  rows.push(line('Customer-months', (y) => y.customerMonths, '#,##0.0'));
  const customerMonthsRow = rows.length;
  rows.push(line('Gross adds (incl. churn replacement)', (y) => y.grossAdds, '#,##0'));
  const grossAddsRow = rows.length;
  rows.push([
    note('Customer-months sums customers across the year’s twelve months and gross adds sums the'),
  ]);
  rows.push([
    note('churn replaced in each of them. Neither is recoverable from a year-end figure, so both'),
  ]);
  rows.push([note('are carried from the model. Every row below is computed from one of them.')]);
  // The one partial answer in this workbook, disclosed where a reader meets it rather than
  // left to be discovered by editing a cell and watching half the sheet move. Pinned by
  // workbookLiveness.test.ts, which asserts both halves of the behaviour AND this wording.
  rows.push([
    note('EDITING PENETRATION IS THE ONE PARTIAL CASE. It re-drives customers at year end and'),
  ]);
  rows.push([
    note('therefore Exit ARR, but NOT customer-months — a year-end share cannot reconstruct a'),
  ]);
  rows.push([
    note('twelve-month ramp — so booked revenue and the cost rows below will not move. Re-run'),
  ]);
  rows.push([note('`npm run model:xlsx` after changing a penetration. Every other input is fully live.')]);

  rows.push([blank]);
  rows.push([sec('Revenue')]);
  rows.push(
    liveLine(
      'Campaigns',
      (y) => y.campaigns,
      (i) => `${ref(customerMonthsRow, col(i))}*${asmName('campaignsPerRestaurantPerMonth')}`,
      '#,##0',
    ),
  );
  const campaignsRow = rows.length;
  rows.push(
    liveLine('GMV', (y) => y.gmv, (i) => `${ref(campaignsRow, col(i))}*${UE.avgCampaignValue}`),
  );
  const gmvRow = rows.length;
  rows.push(
    liveLine(
      'Subscription revenue',
      (y) => y.subscriptionRevenue,
      (i) => `${ref(customerMonthsRow, col(i))}*${UE.blendedSubscription}`,
    ),
  );
  const subscriptionRow = rows.length;
  rows.push(
    liveLine(
      'Take-rate revenue',
      (y) => y.takeRateRevenue,
      (i) => `${ref(gmvRow, col(i))}*${UE.blendedTakeRate}`,
    ),
  );
  const takeRateRow = rows.length;

  rows.push([
    tot('Total revenue'),
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].revenue,
      f: `${ref(subscriptionRow, METRO_YEAR_COLS[i])}+${ref(takeRateRow, METRO_YEAR_COLS[i])}`,
      fmt: '$#,##0',
    })),
  ]);
  const totalRevenueRow = rows.length;

  // Exit ARR beside booked revenue, because the two are different quantities and a sheet
  // that shows only one invites the reader to treat it as the other.
  //
  // This was a plain value on the argument that a live formula would need ARPU as a cell and
  // ARPU is DERIVED from the tier mix rather than being an assumption. The premise was right
  // and the conclusion was wrong: a derived quantity does not belong on the ASSUMPTIONS sheet,
  // but it belongs perfectly well on Unit_Economics as a formula over the assumption cells,
  // which is where `ue_arpuPerCustomerMonth` now is. The `12` is the calendar — see
  // ALLOWED_LITERALS in workbookProvenance.test.ts.
  rows.push(
    liveLine(
      'Exit ARR (year-end run rate)',
      (y) => y.exitArr,
      (i) => `${ref(customersRow, col(i))}*${UE.arpuPerCustomerMonth}*${MONTHS_PER_YEAR}`,
      '$#,##0',
      'headline',
    ),
  );
  rows.push([
    note('Booked revenue is summed month by month while customers ramp; exit ARR is year-end'),
  ]);
  rows.push([note('customers at a full year of the registered mix. They are not comparable.')]);

  rows.push([blank]);
  rows.push([sec('Cost of revenue')]);
  // Negative, like every cost row here — "Total cost of revenue" and "Gross profit" below ADD
  // them. The leading minus is on the whole bracket rather than distributed, so the formula
  // reads as "the cost, made negative" rather than as a subtraction of two positives.
  rows.push(
    liveLine(
      'Stripe fees',
      (y) => -y.stripeCost,
      (i) =>
        `-(${ref(gmvRow, col(i))}*${asmName('stripePctFee')}` +
        `+${ref(campaignsRow, col(i))}*${asmName('stripeFixedFee')})`,
    ),
  );
  const stripeRow = rows.length;
  rows.push(
    liveLine(
      'AI and infrastructure',
      (y) => -y.serveCost,
      (i) =>
        `-(${ref(customerMonthsRow, col(i))}*(${asmName('aiCostPerCustomerMonth')}` +
        `+${asmName('infraCostPerCustomerMonth')}))`,
    ),
  );
  const aiRow = rows.length;

  rows.push([
    tot('Total cost of revenue'),
    ...MODEL_YEARS.map((_, i) => ({
      v: -years[i].costOfRevenue,
      f: `${ref(stripeRow, METRO_YEAR_COLS[i])}+${ref(aiRow, METRO_YEAR_COLS[i])}`,
      fmt: '$#,##0',
    })),
  ]);
  const totalCostRow = rows.length;

  rows.push([
    tot('Gross profit'),
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].grossProfit,
      // Cost rows are already negative, so this is addition, not subtraction.
      f: `${ref(totalRevenueRow, METRO_YEAR_COLS[i])}+${ref(totalCostRow, METRO_YEAR_COLS[i])}`,
      fmt: '$#,##0',
    })),
  ]);
  const grossProfitRow = rows.length;

  rows.push([blank]);
  rows.push([sec('Marketing')]);
  // Charged on GROSS adds, not net growth — see `projectMetroYear`. `ue_cac` is the midpoint
  // of the registered low/high band, so editing either end of the band moves this row.
  rows.push(
    liveLine(
      'Acquisition marketing',
      (y) => -y.marketingCost,
      (i) => `-(${ref(grossAddsRow, col(i))}*${UE.cac})`,
    ),
  );
  const marketingRow = rows.length;

  rows.push([blank]);
  rows.push([
    key('Metro EBITDA'),
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].metroEbitda,
      f: `${ref(grossProfitRow, METRO_YEAR_COLS[i])}+${ref(marketingRow, METRO_YEAR_COLS[i])}`,
      fmt: '$#,##0',
    })),
  ]);

  rows.push([blank]);
  rows.push([sec('KPIs')]);

  // The three ratios divide by "Total revenue", which is 0 in a metro's pre-launch year
  // (Palm Beach, 2026). `metroKpis()` guards that with its own `revenue === 0 ? 0 : …`, so
  // the formula must guard it too, or Excel shows #DIV/0! where the cache shows 0. The
  // marketing / cost-of-revenue source rows are stored negative, hence the leading `-`.
  const revZero = (i: number) => `${ref(totalRevenueRow, METRO_YEAR_COLS[i])}=0`;
  rows.push([
    t('Gross margin'),
    ...MODEL_YEARS.map((_, i) => ({
      v: metroKpis(years[i]).grossMarginPct,
      f: `IF(${revZero(i)},0,${ref(grossProfitRow, METRO_YEAR_COLS[i])}/${ref(totalRevenueRow, METRO_YEAR_COLS[i])})`,
      fmt: '0.0%',
    })),
  ]);
  rows.push([
    t('Marketing as % of revenue'),
    ...MODEL_YEARS.map((_, i) => ({
      v: metroKpis(years[i]).marketingPctOfRevenue,
      f: `IF(${revZero(i)},0,-${ref(marketingRow, METRO_YEAR_COLS[i])}/${ref(totalRevenueRow, METRO_YEAR_COLS[i])})`,
      fmt: '0.0%',
    })),
  ]);
  rows.push([
    t('Cost of revenue as % of revenue'),
    ...MODEL_YEARS.map((_, i) => ({
      v: metroKpis(years[i]).costOfRevenuePctOfRevenue,
      f: `IF(${revZero(i)},0,-${ref(totalCostRow, METRO_YEAR_COLS[i])}/${ref(totalRevenueRow, METRO_YEAR_COLS[i])})`,
      fmt: '0.0%',
    })),
  ]);

  return { name: sheetName, rows };
}

/**
 * The unnamed later metros: N copies of the template metro's own sheet.
 *
 * Every figure here is the TEMPLATE SHEET'S cell times the metro count, which is exactly what
 * `cohortMetroYear` does in TypeScript (`COHORT_SCALED_FIELDS.map(k => template[k] * count)`).
 * Referencing the template's rows rather than re-deriving revenue from customer-months keeps
 * one definition of the ramp: change a tier price and it moves on the template sheet, and this
 * sheet follows because it multiplies that sheet.
 *
 * The count itself is live off `asm_cohortMetros_<year>`, so "how many metros" is editable on
 * the Assumptions sheet the way the prose above has always claimed it was.
 */
function cohortSheet(sourceSheets: readonly SheetSpec[]): SheetSpec {
  const years = rollup().map((r) => r.metros.find((m) => m.metroId === COHORT_METRO_ID)!);
  const templateSheetName = SHEET_BY_METRO[COHORT_TEMPLATE_METRO_ID];
  const template = sourceSheets.find((sheet) => sheet.name === templateSheetName);
  if (!template) {
    // The same failure `cohortMetroYear` guards against, one layer up: a template metro that
    // is disabled or renamed would otherwise leave this sheet silently pointing at nothing.
    throw new Error(
      `The cohort template metro "${COHORT_TEMPLATE_METRO_ID}" has no sheet in this workbook, ` +
        `so Metros_4toN cannot reference it. Enable the metro or pick a new template.`,
    );
  }
  const cref = (row: number, i: number) => `Metros_4toN!${METRO_YEAR_COLS[i]}${row}`;
  const tmplRef = (label: string, i: number) =>
    `${templateSheetName}!${METRO_YEAR_COLS[i]}${rowOf(template, label)}`;

  const rows: CellRow[] = [
    [title('Metros beyond the four named'), ...MODEL_YEARS.map((y) => hdr(String(y)))],
    [note('These metros have not been chosen. Modeled as N copies of a TEMPLATE metro rather')],
    [note('than as invented named cities. Change the count on the Assumptions sheet.')],
    [note(`Template: ${COHORT_TEMPLATE_METRO_ID} — a real registered metro with real Census`)],
    [note('counts and a ramp appropriate to a market entered in month 12 with no local presence,')],
    [note('which is the situation every metro in this cohort is in. It was Hoboken until')],
    [note('2026-08-26: a one-square-mile town of 123 venues carrying the founders’ home-town 35%')],
    [note('penetration, applied to 17 cities nobody has entered.')],
    [note(`Every row below is the matching ${templateSheetName} row times the count, which is what`)],
    [note('the rollup does in code. Nothing on this sheet is a second derivation of the ramp.')],
    [blank],
    [
      t('Metros in cohort'),
      ...MODEL_YEARS.map((y) => ({
        v: COHORT_METRO_COUNTS[y].value,
        f: asmName(`cohortMetros_${y}`),
        fmt: '#,##0',
      })),
    ],
  ];
  const countRow = rows.length;

  const scaled = (
    label: string,
    templateLabel: string,
    pick: (y: (typeof years)[number]) => number,
    fmt = '$#,##0',
    role?: CellRole,
  ): CellRow => [
    { v: label, ...(role ? { role } : {}) },
    ...MODEL_YEARS.map((_, i) => ({
      v: pick(years[i]),
      f: `${tmplRef(templateLabel, i)}*${cref(countRow, i)}`,
      fmt,
    })),
  ];

  rows.push(
    scaled('Customers at year end', 'Customers at year end', (y) => y.customersAtYearEnd, '#,##0'),
    scaled('Revenue', 'Total revenue', (y) => y.revenue),
    scaled('Exit ARR (year-end run rate)', 'Exit ARR (year-end run rate)', (y) => y.exitArr),
    scaled('Gross profit', 'Gross profit', (y) => y.grossProfit),
    // Both sides are already negative: the template's "Acquisition marketing" row is stored
    // negative, and this sheet prints `-marketingCost`. Multiplying by a positive count keeps
    // the sign, so this is not a second negation.
    scaled('Marketing', 'Acquisition marketing', (y) => -y.marketingCost),
    scaled('Metro EBITDA', 'Metro EBITDA', (y) => y.metroEbitda, '$#,##0', 'headline'),
  );

  return { name: 'Metros_4toN', rows };
}

/**
 * CONFIDENTIAL. Only ever reached from the confidential branch of `buildWorkbookSpec` — see
 * `SHARED_COSTS_SHEET`.
 */
function sharedCostsSheet(): SheetSpec {
  const years = consolidated();
  const rows: CellRow[] = [
    [title('Shared costs'), ...MODEL_YEARS.map((y) => hdr(String(y)))],
    [note('Payroll, AI and shared infrastructure, allocated across metros by revenue share.')],
    [note('Before any metro has revenue the split is even — a revenue-weighted split of zero')],
    [note('is a division by zero, not an allocation.')],
    [blank],
    [key('Total shared cost'), ...MODEL_YEARS.map((y) => n(sharedCostForYear(y)))],
    [blank],
    [sec('Allocation')],
  ];
  const metroIds = years[0].allocations.map((a) => a.metroId);
  for (const id of metroIds) {
    rows.push([
      t(id),
      ...years.map((y) => n(y.allocations.find((a) => a.metroId === id)?.amount ?? 0)),
    ]);
  }
  return { name: 'Shared_Costs', rows };
}

/**
 * `SOURCE_COLS` is where a metro or cohort sheet's own years live (label in A, no toggle
 * column, so years are B/C/D). `TOTALS_COLS` is where THIS sheet's years live (label in A,
 * "Include?" toggle in B, so years are C/D/E). A cross-sheet reference (anything after a
 * `!`) always uses `SOURCE_COLS`; anything addressing this sheet's own rows uses
 * `TOTALS_COLS`. Conflating the two was an earlier bug here: it read each metro's NEXT
 * year's revenue instead of its own, and read a trailing empty column as 0.
 */
const SOURCE_COLS = ['B', 'C', 'D'] as const;
const TOTALS_COLS = ['C', 'D', 'E'] as const;

/**
 * The 1-indexed Excel row on `sheet` whose label cell reads `label`.
 *
 * This replaces a hand-maintained map of row numbers per sheet. That map was a trap: adding
 * an explanatory line to the cohort sheet silently shifted every row below it, and the map
 * would have gone on pointing at whatever landed on the old row — a formula reading the
 * wrong figure while its cached value stayed right, which is the one failure mode a live
 * workbook must not have. Both failure directions throw rather than guess.
 */
function rowOf(sheet: SheetSpec, label: string): number {
  const hits = sheet.rows
    .map((row, i) => (row[0]?.v === label ? i + 1 : 0))
    .filter((i) => i > 0);
  if (hits.length !== 1) {
    throw new Error(
      `Sheet "${sheet.name}" has ${hits.length} rows labelled "${label}"; a cross-sheet ` +
        `formula needs exactly one. Rename the duplicate or fix the label.`,
    );
  }
  return hits[0];
}

/**
 * `confidential` gates TWO rows here, `Shared cost` and the consolidated `EBITDA` beneath it.
 *
 * They are omitted, never zeroed. A zero is a claim — "$0 of company-level cost" is a
 * statement about the business, and a false one — where an absent row says only that this
 * workbook does not carry the figure. The same reasoning as `TrajectoryConsolidatedEbitda`:
 * the confidential half is absent, not hidden.
 *
 * `Metro EBITDA` stays in both builds. It is the metros' own contribution, summed from the
 * metro sheets, and nothing about it depends on the budget.
 */
function totalsSheet(sourceSheets: readonly SheetSpec[], confidential: boolean): SheetSpec {
  const years = consolidated();
  const metroIds = years[0].metros.map((m) => m.metroId);
  const sheetFor = (id: string) => SHEET_BY_METRO[id] ?? 'Metros_4toN';
  const specFor = (id: string) => {
    const name = sheetFor(id);
    const found = sourceSheets.find((s) => s.name === name);
    if (!found) throw new Error(`Totals references sheet "${name}", which is not in the workbook.`);
    return found;
  };
  // Looked up by LABEL, never by a remembered row number. Metro sheets and the cohort sheet
  // have different layouts, and both move when a line of explanation is added.
  // The cohort sheet has no subscription/take-rate split to total up, so its revenue row is
  // labelled plainly. A LABEL that differs per sheet is fine and visible in this file; a ROW
  // NUMBER that differs per sheet is the thing that went stale.
  const revenueLabel = (id: string) => (id === COHORT_METRO_ID ? 'Revenue' : 'Total revenue');
  const REVENUE_ROW: Readonly<Record<string, number>> = Object.fromEntries(
    metroIds.map((id) => [id, rowOf(specFor(id), revenueLabel(id))]),
  );
  const EBITDA_ROW: Readonly<Record<string, number>> = Object.fromEntries(
    metroIds.map((id) => [id, rowOf(specFor(id), 'Metro EBITDA')]),
  );
  // Both sheet layouts label this row identically, so unlike revenue it needs no per-sheet
  // variant. Added when the Totals Exit ARR row became live — see the note there.
  const EXIT_ARR_ROW: Readonly<Record<string, number>> = Object.fromEntries(
    metroIds.map((id) => [id, rowOf(specFor(id), 'Exit ARR (year-end run rate)')]),
  );
  // Also identical across both layouts. Used only by `Metros live`, which asks whether a
  // metro has a customer relationship at year end — see the note there for why that, and
  // not revenue, is the question.
  const CUSTOMERS_ROW: Readonly<Record<string, number>> = Object.fromEntries(
    metroIds.map((id) => [id, rowOf(specFor(id), 'Customers at year end')]),
  );
  // Every reference is sheet-qualified, even ones addressing this same Totals sheet — see
  // formulaEval.ts's header comment for why.
  const tref = (row: number, col: string) => `Totals!${col}${row}`;

  const rows: CellRow[] = [
    [title('Consolidated'), hdr('Include?'), ...MODEL_YEARS.map((y) => hdr(String(y)))],
    [blank],
    [sec('Revenue by metro')],
  ];

  const firstMetroRow = rows.length + 1;
  const toggleRowByMetro: Record<string, number> = {};
  metroIds.forEach((id) => {
    const toggleRow = rows.length + 1;
    toggleRowByMetro[id] = toggleRow;
    rows.push([
      t(id),
      { v: 'YES', role: 'input' },
      ...MODEL_YEARS.map((_, i) => {
        const value = years[i].metros.find((m) => m.metroId === id)?.revenue ?? 0;
        const source = `${sheetFor(id)}!${SOURCE_COLS[i]}${REVENUE_ROW[id]}`;
        return { v: value, f: `IF(${tref(toggleRow, 'B')}="NO",0,${source})`, fmt: '$#,##0' };
      }),
    ]);
  });

  rows.push([blank]);
  rows.push([
    tot('Total revenue (booked in year)'),
    blank,
    ...MODEL_YEARS.map((_, i) => {
      // SUM over an explicit comma-separated list of refs, not a `C4:C6` colon range — the
      // evaluator's tokenizer (deliberately, see formulaEval.ts) has no notion of a range,
      // and a colon range would also be redundant syntax once every ref is sheet-qualified.
      // Numerically identical to a range; just a different, evaluator-checkable spelling.
      const refs = metroIds.map((_id, idx) => tref(firstMetroRow + idx, TOTALS_COLS[i]));
      return { v: years[i].revenue, f: `SUM(${refs.join(',')})`, fmt: '$#,##0' };
    }),
  ]);

  const metroEbitdaRow = rows.length + 1;
  rows.push([
    key('Metro EBITDA'),
    blank,
    ...MODEL_YEARS.map((_, i) => {
      // Correction 2: this must be a live formula too — otherwise changing a metro
      // assumption would flow through to consolidated revenue but not to consolidated
      // EBITDA. One row per metro is not needed (unlike the revenue block above); this
      // single row sums each metro sheet's OWN EBITDA cell, honouring the same toggles.
      const terms = metroIds.map((id) => {
        const source = `${sheetFor(id)}!${SOURCE_COLS[i]}${EBITDA_ROW[id]}`;
        return `IF(${tref(toggleRowByMetro[id], 'B')}="NO",0,${source})`;
      });
      return { v: years[i].metroEbitda, f: `SUM(${terms.join(',')})`, fmt: '$#,##0' };
    }),
  ]);

  if (confidential) {
    // Stays a plain value, deliberately: not a per-metro figure — it comes from the
    // confidential budget at the rollup layer, not from any metro sheet.
    rows.push([tot('Shared cost'), blank, ...years.map((y) => n(-y.sharedCost))]);
    const sharedCostRow = rows.length;

    rows.push([
      key('EBITDA'),
      blank,
      ...MODEL_YEARS.map((_, i) => ({
        v: years[i].ebitda,
        f: `${tref(metroEbitdaRow, TOTALS_COLS[i])}+${tref(sharedCostRow, TOTALS_COLS[i])}`,
        fmt: '$#,##0',
      })),
    ]);
  } else {
    // The confidential build says this with the two rows above: `Metro EBITDA`, then the
    // shared-cost line, then the sum. With those gone, `Metro EBITDA` is the last profit
    // figure on the sheet and nothing on it says what is still missing — so a reader could
    // reasonably take it for the company's. One line of prose, carrying no figure, closes
    // that. It is not a redaction notice: the deck says the same thing in public already.
    rows.push([
      note('Metro EBITDA is what the metros themselves earn — after delivery cost and each'),
    ]);
    rows.push([
      note('metro’s own marketing, and BEFORE company-level payroll, AI and infrastructure.'),
    ]);
    rows.push([note('It is not the company’s EBITDA and must not be read as one.')]);
  }

  /**
   * Live and toggled, like every consolidated row above it.
   *
   * It shipped as a plain value on the argument that "the cohort's metro count is not
   * expressible as a cell reference". That was already false when it was written: the count
   * is on the Assumptions sheet as `asm_cohortMetros_<year>`, put there by `assumptionRows`.
   * The cost was a summary that contradicted the sheet — switch Manhattan off, watch revenue,
   * Exit ARR and Metro EBITDA all drop, and read "4 metros live" underneath.
   *
   * **Read `RollupYear.metrosLive` before touching this formula.** It is not a count of rows
   * and not a count of toggles that are on:
   *
   *   - a NAMED metro counts 1 only in years where it actually has a customer relationship
   *     at year end, which is why 2026 is 2 and not 4 — Palm Beach and the Hamptons are not
   *     entered yet. The test is `customersAtYearEnd > 0`, taken from that sheet's own
   *     "Customers at year end" row, not `revenue > 0`. The two agree on today's numbers,
   *     but they are different questions and the model asks this one.
   *   - the COHORT row counts `COHORT_METRO_COUNTS[year]` — 6 in 2027, 17 in 2028 — never 1.
   *     It stands in for N metros, and counting it as one row would report "5" for 2028
   *     while the model books revenue for 21 metros. Its own condition is `revenue > 0`,
   *     again matching the model rather than being made symmetric for tidiness.
   *
   * The literal `1` is a cardinality — one metro is one metro — not a modeled magnitude, and
   * it is registered as such in `workbookProvenance.test.ts`'s ALLOWED_LITERALS.
   */
  rows.push([
    t('Metros live'),
    blank,
    ...MODEL_YEARS.map((_, i) => {
      const terms = metroIds.map((id) => {
        const off = `${tref(toggleRowByMetro[id], 'B')}="NO"`;
        if (id === COHORT_METRO_ID) {
          const revenue = `${sheetFor(id)}!${SOURCE_COLS[i]}${REVENUE_ROW[id]}`;
          return `IF(${off},0,IF(${revenue}>0,${asmName(`cohortMetros_${MODEL_YEARS[i]}`)},0))`;
        }
        const customers = `${sheetFor(id)}!${SOURCE_COLS[i]}${CUSTOMERS_ROW[id]}`;
        return `IF(${off},0,IF(${customers}>0,1,0))`;
      });
      return { v: years[i].metrosLive, f: `SUM(${terms.join(',')})`, fmt: '#,##0' };
    }),
  ]);

  rows.push(
    [blank],
    [sec('Exit ARR — the year-end RUN RATE, not what was booked during the year')],
    // Live and toggled, for the same reason the revenue and EBITDA rows above are. This
    // shipped as a plain value on the argument that a live formula would need ARPU as a cell
    // and ARPU is derived from the tier mix -- true of the METRO sheets, false here, because
    // every metro sheet already prints its own Exit ARR row and this is only their sum.
    // The cost of the plain value was not cosmetic: the README advertises the YES/NO toggles,
    // so a reader switches Manhattan off, watches booked revenue drop by a third, and sees
    // Exit ARR and the cross-check multiple below it refuse to move. A cross-check that
    // silently ignores the control the sheet tells you to use is worse than no cross-check.
    [
      key('Exit ARR'),
      blank,
      ...MODEL_YEARS.map((_, i) => {
        const terms = metroIds.map((id) => {
          const source = `${sheetFor(id)}!${SOURCE_COLS[i]}${EXIT_ARR_ROW[id]}`;
          return `IF(${tref(toggleRowByMetro[id], 'B')}="NO",0,${source})`;
        });
        return { v: years[i].exitArr, f: `SUM(${terms.join(',')})`, fmt: '$#,##0' };
      }),
    ],
  );
  const exitArrRow = rows.length;
  rows.push(
    [note('Booked revenue above is summed month by month while customers are still ramping, so')],
    [note('it sits below the year-end run rate in every growth year. The comparison below needs')],
    [note('the run rate, because the plan it compares against is stated as ARR.')],
    [blank],
    [sec('Cross-check — the SUPERSEDED top-down plan (PROJECT_CONTEXT section 3, before 2026-08-26)')],
    [t('Prior plan ARR, low'), blank, ...years.map((y) => n(y.priorPlanArrLow))],
    [t('Prior plan ARR, high'), blank, ...years.map((y) => n(y.priorPlanArrHigh))],
  );
  const lowRow = rows.length - 1;
  const highRow = rows.length;
  rows.push([
    tot('Exit ARR as a multiple of the prior plan’s band midpoint'),
    blank,
    ...MODEL_YEARS.map((_, i) => ({
      v: years[i].bottomUpVsPriorPlan,
      // EXIT ARR over the band, never booked revenue over the band. The band is an ARR
      // figure; dividing booked revenue by it compared two different quantities.
      f: `${tref(exitArrRow, TOTALS_COLS[i])}/((${tref(lowRow, TOTALS_COLS[i])}+${tref(highRow, TOTALS_COLS[i])})/2)`,
      fmt: '0.00x',
    })),
  ]);
  rows.push(
    [note('These are expected to disagree, and the gap is reported rather than closed. Section 3')],
    [note('now states this model’s figures; the band above is kept as the plan it replaced, so an')],
    [note('investor who saw the earlier number can be answered. Neither side has been tuned to')],
    [note('meet the other — the band’s six values are unchanged, deliberately, because updating')],
    [note('them to match would make the ratio 1.00x by construction and the cross-check worthless.')],
  );
  return { name: 'Totals', rows };
}

/**
 * The tier-mix blends, the campaign value and the CAC midpoint, as LIVE formulas over the
 * Assumptions sheet's named cells.
 *
 * These are the cells every metro sheet multiplies its customer-months by, so they are what
 * makes editing a tier price or the mix reach revenue. They live here rather than on
 * Assumptions because they are not assumptions: each is computed from four or two cells that
 * are. Putting a blend on the Assumptions sheet would invite a reader to edit it directly and
 * silently decouple it from the mix it is supposed to summarise.
 *
 * Public-safe by construction: every input is in `REGISTER`, which ships on the Assumptions
 * sheet in both builds. Nothing here reads `./confidential`.
 */
function derivedDriverFormulas(): Readonly<Record<keyof typeof UE, string>> {
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const blend = (rate: (tier: string) => string) =>
    TIERS.map((tier) => `${asmName(`tierMix${cap(tier)}`)}*${rate(tier)}`).join('+');

  // `(low+high)/2*deliverables` — the same order `avgCampaignValue()` computes it in.
  const avgCampaignValueF =
    `(${asmName('campaignPriceStandardLow')}+${asmName('campaignPriceStandardHigh')})/2` +
    `*${asmName('deliverablesPerCampaign')}`;

  return {
    blendedSubscription: blend((tier) => asmName(`price_${tier}`)),
    blendedTakeRate: blend((tier) => asmName(`takeRate_${tier}`)),
    avgCampaignValue: avgCampaignValueF,
    // Reproduces `revenuePerCustomerMonth`, which is documented as the model's single
    // definition of ARPU: one customer's subscription plus the take rate on the campaigns
    // that one customer runs in a month. Written from the other two ue_ cells rather than
    // re-expanded from the mix, so it cannot drift from them.
    arpuPerCustomerMonth:
      `${UE.blendedSubscription}+${asmName('campaignsPerRestaurantPerMonth')}` +
      `*${UE.avgCampaignValue}*${UE.blendedTakeRate}`,
    cac: `(${asmName('restaurantCacLow')}+${asmName('restaurantCacHigh')})/2`,
  };
}

function unitEconomicsSheet(): SheetSpec {
  const u = unitEconomics(REGISTERED_MIX);
  const f = derivedDriverFormulas();
  const driver = (key: keyof typeof UE, v: number, fmt: string): Cell => ({
    v,
    f: f[key],
    name: UE[key],
    fmt,
  });
  return {
    name: 'Unit_Economics',
    rows: [
      [title('Unit economics'), hdr('Value')],
      [t('Gross profit per business per month'), n(u.grossProfitPerBusinessPerMonth, '$#,##0.00')],
      [t('Customer lifetime (months)'), n(u.customerLifetimeMonths, '#,##0.0')],
      [key('LTV'), n(u.ltv)],
      [t('LTV:CAC at low CAC'), { v: u.ltvToCacAtCacLow, fmt: '0.00x' }],
      [t('LTV:CAC at high CAC'), { v: u.ltvToCacAtCacHigh, fmt: '0.00x' }],
      [t('CAC payback at low CAC (months)'), n(u.cacPaybackMonthsAtCacLow, '#,##0.0')],
      [t('CAC payback at high CAC (months)'), n(u.cacPaybackMonthsAtCacHigh, '#,##0.0')],
      [blank],
      [note('CAC is MODELED, not measured — the source states it as a target and DragonCandy has')],
      [note('never acquired a paying customer. This is a projection measured against a projection.')],
      [blank],
      [sec('Derived drivers — what the tier mix is worth')],
      [note('These are NOT assumptions and are not on the Assumptions sheet. Each is computed from')],
      [note('the tier-mix, pricing and cost cells that ARE, and every metro sheet references these')],
      [note('by name — so changing a tier price or the mix moves campaigns, GMV, revenue and cost')],
      [note('on all four metro sheets, the cohort sheet and the Totals rollup.')],
      [t('Blended subscription per customer per month'),
       driver('blendedSubscription', blendedSubscription(REGISTERED_MIX), '$#,##0.00')],
      [t('Blended take rate'), driver('blendedTakeRate', blendedTakeRate(REGISTERED_MIX), '0.00%')],
      [t('Average campaign value'), driver('avgCampaignValue', avgCampaignValue(), '$#,##0.00')],
      [t('Revenue per customer per month (ARPU)'),
       driver('arpuPerCustomerMonth', revenuePerCustomerMonth(REGISTERED_MIX), '$#,##0.00')],
      [t('Blended restaurant CAC (midpoint of the registered band)'),
       driver('cac', blendedCac(), '$#,##0')],
    ],
  };
}

function financingSheet(): SheetSpec {
  const total = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
  const raise = preSeedRaise();
  const allocation = buildFundsAllocation(raise.raise, USE_OF_FUNDS_SPLIT);
  const rows: CellRow[] = [
    [title('Financing — CONFIDENTIAL'), hdr('Amount')],
    [blank],
    [sec('Pre-seed budget')],
  ];
  for (const line of PRE_SEED_BUDGET) {
    rows.push([
      t(line.label),
      n(line.monthlyCost, '$#,##0'),
      t(`months ${line.startMonth}–${line.endMonth}`),
    ]);
  }
  rows.push(
    [blank],
    [tot(`Total over ${PRE_SEED_HORIZON_MONTHS} months`), n(total)],
    [key('Raise'), n(raise.raise)],
    [blank],
    [sec('Use of funds')],
  );
  for (const bucket of allocation) {
    rows.push([t(bucket.label), { v: bucket.share, fmt: '0%' }, n(bucket.amount)]);
  }
  rows.push(
    [blank],
    [note('SAFE terms — cap, discount, MFN — are a founder decision, not a derivation, and are')],
    [note('deliberately absent. Launch event budget is blocked on launchEventPlan in deck/pending.ts.')],
  );
  return { name: FINANCING_SHEET, rows };
}

export function buildWorkbookSpec({ confidential }: { confidential: boolean }): readonly SheetSpec[] {
  // The metro and cohort sheets are built FIRST, because `totalsSheet` resolves its
  // cross-sheet formula targets by reading their labels rather than by remembering their
  // row numbers. See `rowOf`.
  const metroSheets = enabledMetros().map((m) => metroSheet(m.id));
  const sourceSheets: SheetSpec[] = [...metroSheets, cohortSheet(metroSheets)];
  const sheets: SheetSpec[] = [
    readmeSheet(confidential),
    { name: 'Assumptions', rows: [
      [hdr('key'), hdr('label'), hdr('value'), hdr('provenance'), hdr('source'), hdr('as of'), hdr('unit'), hdr('note')],
      ...assumptionRows(confidential),
    ] },
    sourcesSheet(),
    ...sourceSheets,
    // Never built and then filtered out by name downstream: a filter is one forgotten call
    // site away from being bypassed, and this is the sheet whose every row is the budget.
    ...(confidential ? [sharedCostsSheet()] : []),
    totalsSheet(sourceSheets, confidential),
    unitEconomicsSheet(),
  ];
  if (confidential) sheets.push(financingSheet());
  return sheets;
}
