import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec, type SheetSpec } from './workbook';
import { evaluateFormula, collectFormulaContext, type FormulaContext } from './formulaEval';
import { MODEL_YEARS, enabledMetros } from './metros';

/**
 * The workbook must not merely CONTAIN named assumption cells — it must USE them.
 *
 * Codex filed this as a P1 and it was right: `asm_` appeared exactly once in workbook.ts, at
 * the line that defines the names. Every name resolved, every formula agreed with its cache,
 * every provenance walk passed, and editing the Assumptions sheet changed nothing, because no
 * formula had ever referenced one. A defined name nothing reads is a decoration, and nothing
 * in the suite could tell it from a wired one.
 *
 * These two suites close that. The first asserts the references exist by name; the second
 * asserts they carry a value — that changing an input actually moves an output, which is the
 * founder's question ("if we change a number in the sheet will it add up correctly?") asked
 * as a test rather than as a claim in a README.
 */

const spec = buildWorkbookSpec({ confidential: true });

/** Every formula string in the workbook, with where it came from, for error messages. */
const formulas: Array<{ where: string; f: string }> = spec.flatMap((sheet) =>
  sheet.rows.flatMap((row, r) =>
    row.flatMap((cell, c) =>
      cell.f === undefined ? [] : [{ where: `${sheet.name}!R${r + 1}C${c + 1}`, f: cell.f }],
    ),
  ),
);

/**
 * Whole-name matching, never `includes`. A substring test would report `asm_price_free` as
 * referenced by a formula that only mentions `asm_price_freeloader`, and — more likely here —
 * would let a name pass on the strength of being a prefix of a longer one.
 */
function referencedBy(name: string, haystack: readonly string[]): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
  return haystack.some((f) => re.test(f));
}

describe('every driver assumption is actually reached by a formula', () => {
  /**
   * The inputs this workbook claims a reader can edit. Not every registered assumption — the
   * trajectory band, the operating burn and the creator ratio genuinely do not drive a metro
   * sheet, and listing them here would force a fake reference to make the test pass. These are
   * the ones a metro sheet's revenue, cost and marketing rows are built from.
   */
  const REQUIRED: readonly string[] = [
    // Pricing and the tier mix, via ue_blendedSubscription / ue_blendedTakeRate.
    'asm_price_free', 'asm_price_starter', 'asm_price_growth', 'asm_price_pro',
    'asm_takeRate_free', 'asm_takeRate_starter', 'asm_takeRate_growth', 'asm_takeRate_pro',
    'asm_tierMixFree', 'asm_tierMixStarter', 'asm_tierMixGrowth', 'asm_tierMixPro',
    // Campaign volume and value.
    'asm_campaignsPerRestaurantPerMonth',
    'asm_campaignPriceStandardLow', 'asm_campaignPriceStandardHigh', 'asm_deliverablesPerCampaign',
    // Cost of revenue.
    'asm_stripePctFee', 'asm_stripeFixedFee',
    'asm_aiCostPerCustomerMonth', 'asm_infraCostPerCustomerMonth',
    // Acquisition.
    'asm_restaurantCacLow', 'asm_restaurantCacHigh',
    // Per-metro penetration, and how many metros the cohort stands in for.
    ...enabledMetros().flatMap((m) =>
      MODEL_YEARS.map((y) => `asm_${m.id.replace(/[^A-Za-z0-9_]/g, '_')}_penetration_${y}`),
    ),
    ...MODEL_YEARS.map((y) => `asm_cohortMetros_${y}`),
  ];

  it('defines every name it is about to look for', () => {
    // Half of the control. "Referenced" is worthless if the name was never defined either —
    // the test would be asserting that a typo is absent from both sides.
    const defined = new Set(
      spec.flatMap((s) => s.rows.flat()).flatMap((c) => (c.name ? [c.name] : [])),
    );
    const missing = REQUIRED.filter((name) => !defined.has(name));
    expect(missing, `these names are in REQUIRED but no cell defines them`).toEqual([]);
  });

  it('references every one of them from at least one formula', () => {
    const unreferenced = REQUIRED.filter((name) => !referencedBy(name, formulas.map((x) => x.f)));
    expect(
      unreferenced,
      `${unreferenced.length} named assumption cell(s) are defined and never read. Editing them ` +
        `on the Assumptions sheet changes nothing, which is the exact defect this suite exists ` +
        `for. Wire the cell into the formula that consumes it — do not delete it from REQUIRED.`,
    ).toEqual([]);
  });

  it('CONTROL: the same check FAILS when a reference is removed', () => {
    // Proven, not asserted. Strip every mention of one name from every formula and re-run the
    // identical predicate; if it still passes, the check above is measuring nothing.
    const victim = 'asm_stripePctFee';
    expect(referencedBy(victim, formulas.map((x) => x.f))).toBe(true);
    const mutated = formulas.map((x) => x.f.replace(new RegExp(victim, 'g'), '0'));
    expect(referencedBy(victim, mutated)).toBe(false);
  });
});

/**
 * Re-evaluate the whole workbook from a context, to a fixed point.
 *
 * Iterating to convergence rather than in one ordered pass, because the dependency order runs
 * ACROSS sheets and against `SHEET_ORDER`: the metro sheets multiply `ue_blendedSubscription`,
 * which lives on Unit_Economics, which Excel puts second to last. One pass in sheet order
 * would read the stale cached blend and report the model frozen when it is not — the
 * cross-sheet version of the mistake formulaAgreement.test.ts's toggle suite documents.
 *
 * A defined name and its cell are the same cell, so a formula cell that carries a name must
 * write BOTH back. Updating only the address is how `ue_*` would go stale mid-pass.
 */
function evaluateToFixedPoint(sheets: readonly SheetSpec[], overrides: Record<string, number>) {
  const base = collectFormulaContext(sheets);
  const ctx: FormulaContext = {
    names: { ...base.names, ...overrides },
    cells: { ...base.cells },
  };
  const MAX_PASSES = 12;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let changed = false;
    for (const sheet of sheets) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.f === undefined) return;
          const value = evaluateFormula(cell.f, ctx);
          const addr = `${sheet.name}!${String.fromCharCode(65 + c)}${r + 1}`;
          if (ctx.cells[addr] !== value) {
            (ctx.cells as Record<string, number>)[addr] = value;
            changed = true;
          }
          if (cell.name && ctx.names[cell.name] !== value) {
            (ctx.names as Record<string, number>)[cell.name] = value;
            changed = true;
          }
        });
      });
    }
    if (!changed) return ctx;
  }
  throw new Error(`workbook did not converge in ${MAX_PASSES} passes`);
}

describe('changing a number on the Assumptions sheet adds up correctly', () => {
  const totals = spec.find((s) => s.name === 'Totals')!;
  const lastYear = MODEL_YEARS.length - 1;

  /** A Totals row's final-year cell address. Label in A, toggle in B, so years are C/D/E. */
  const totalsCell = (label: string): string => {
    const r = totals.rows.findIndex((row) => row[0]?.v === label);
    expect(r, `no row labelled "${label}" on Totals`).toBeGreaterThanOrEqual(0);
    return `Totals!${String.fromCharCode(67 + lastYear)}${r + 1}`;
  };

  const revenue = totalsCell('Total revenue (booked in year)');
  const ebitda = totalsCell('Metro EBITDA');
  const exitArr = totalsCell('Exit ARR');

  it('CONTROL: with nothing changed, re-evaluation reproduces the cached workbook', () => {
    // Without this, every assertion below could be reading a number the re-evaluation
    // invented rather than the one the sheet shows.
    const ctx = evaluateToFixedPoint(spec, {});
    const base = collectFormulaContext(spec);
    for (const addr of [revenue, ebitda, exitArr]) {
      expect(Math.abs(ctx.cells[addr] - base.cells[addr])).toBeLessThan(1e-6);
    }
  });

  const base = evaluateToFixedPoint(spec, {});

  it('raising a tier price raises consolidated revenue', () => {
    const names = collectFormulaContext(spec).names;
    const moved = evaluateToFixedPoint(spec, { asm_price_growth: names.asm_price_growth * 2 });
    expect(moved.cells[revenue]).toBeGreaterThan(base.cells[revenue]);
    // ARPU feeds the run rate too, through ue_arpuPerCustomerMonth.
    expect(moved.cells[exitArr]).toBeGreaterThan(base.cells[exitArr]);
  });

  it('raising the Stripe percentage fee lowers metro EBITDA and leaves revenue alone', () => {
    const moved = evaluateToFixedPoint(spec, { asm_stripePctFee: 0.5 });
    expect(moved.cells[ebitda]).toBeLessThan(base.cells[ebitda]);
    // A cost is not a revenue. If this moved, a cost row had leaked into the revenue chain.
    expect(Math.abs(moved.cells[revenue] - base.cells[revenue])).toBeLessThan(1e-6);
  });

  /**
   * Penetration reaches the RUN RATE and deliberately does not reach BOOKED revenue. This is
   * the one partial answer in the workbook and it is pinned here so it stays a documented
   * limit rather than becoming a surprise.
   *
   * Booked revenue is built on `Customer-months`, the sum of customers across the year's twelve
   * months. A year-end penetration cannot reconstruct that sum — the ramp between anchors, and
   * the rounding to whole customers at each month, are not on the sheet. Exit ARR is a year-END
   * quantity, so it recomputes cleanly from `Customers at year end`, which IS live off
   * penetration.
   *
   * The metro sheets and the README both say so where a reader will meet it, and both point at
   * `npm run model:xlsx` as the way to re-drive the ramp. If a future change puts the monthly
   * ramp on the sheet, this test should start failing in the revenue assertion — that is the
   * signal to promote the limit, not to delete the note.
   */
  it("raising a metro's penetration raises Exit ARR but NOT booked revenue", () => {
    const key = `asm_${enabledMetros()[0].id.replace(/[^A-Za-z0-9_]/g, '_')}_penetration_${MODEL_YEARS[lastYear]}`;
    const names = collectFormulaContext(spec).names;
    expect(names[key], `${key} is not a defined name`).toBeTypeOf('number');
    const moved = evaluateToFixedPoint(spec, { [key]: names[key] * 2 });
    expect(moved.cells[exitArr]).toBeGreaterThan(base.cells[exitArr]);
    expect(Math.abs(moved.cells[revenue] - base.cells[revenue])).toBeLessThan(1e-6);
  });

  it('says so on the metro sheet, where a reader editing penetration will see it', () => {
    // The limit above is only acceptable because it is disclosed. If the wording is dropped,
    // this fails rather than leaving a reader to discover it by editing a cell.
    const metro = spec.find((s) => s.name === 'Hoboken_Model')!;
    const text = metro.rows.flat().map((c) => String(c.v ?? '')).join(' ');
    expect(text).toMatch(/Customer-months/);
    expect(text).toMatch(/model:xlsx/);
  });

  it('raising the cohort metro count raises consolidated revenue', () => {
    const key = `asm_cohortMetros_${MODEL_YEARS[lastYear]}`;
    const names = collectFormulaContext(spec).names;
    const moved = evaluateToFixedPoint(spec, { [key]: names[key] + 1 });
    expect(moved.cells[revenue]).toBeGreaterThan(base.cells[revenue]);
  });

  it('CONTROL: a name nothing reads moves nothing', () => {
    // The mirror image, and the reason the reachability suite above is not redundant with this
    // one: a workbook where NOTHING is wired would pass every "moves" assertion the moment one
    // wire exists. This proves the harness reports "unchanged" when it should.
    const moved = evaluateToFixedPoint(spec, { asm_creatorsPerRestaurant: 999 });
    expect(Math.abs(moved.cells[revenue] - base.cells[revenue])).toBeLessThan(1e-6);
  });
});
