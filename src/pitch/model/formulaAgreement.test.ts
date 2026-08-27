import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { evaluateFormula, collectFormulaContext } from './formulaEval';

describe('the formula evaluator', () => {
  const ctx = { names: { asm_a: 10, asm_b: 4 }, cells: { 'Totals!C5': 7, 'Totals!C6': 3 } };

  it('does arithmetic', () => {
    expect(evaluateFormula('2+3*4', ctx)).toBe(14);
    expect(evaluateFormula('(2+3)*4', ctx)).toBe(20);
  });

  it('resolves defined names', () => {
    expect(evaluateFormula('asm_a-asm_b', ctx)).toBe(6);
  });

  it('resolves sheet-qualified cell references', () => {
    expect(evaluateFormula('Totals!C5+Totals!C6', ctx)).toBe(10);
  });

  it('handles SUM over a list', () => {
    expect(evaluateFormula('SUM(asm_a,asm_b,2)', ctx)).toBe(16);
  });

  it('handles IF with a string comparison, which is how the metro toggles work', () => {
    const toggled = { names: {}, cells: { 'Totals!B7': 'YES' as unknown as number, 'Totals!C7': 500 } };
    expect(evaluateFormula('IF(Totals!B7="NO",0,Totals!C7)', toggled)).toBe(500);
    const off = { names: {}, cells: { 'Totals!B7': 'NO' as unknown as number, 'Totals!C7': 500 } };
    expect(evaluateFormula('IF(Totals!B7="NO",0,Totals!C7)', off)).toBe(0);
  });

  it('throws on a function it does not implement rather than guessing', () => {
    expect(() => evaluateFormula('VLOOKUP(1,2,3)', ctx)).toThrow(/VLOOKUP/);
  });

  /**
   * `>` and nested `IF` arrived together with the `Metros live` row, which asks per metro
   * "is the toggle on, AND does this metro have customers in this year".
   */
  describe('the > comparison', () => {
    it('compares numbers, yielding the 1/0 that IF reads as a boolean', () => {
      expect(evaluateFormula('IF(asm_a>asm_b,100,200)', ctx)).toBe(100);
      expect(evaluateFormula('IF(asm_b>asm_a,100,200)', ctx)).toBe(200);
    });

    it('is strict, not >=, at the boundary the liveness test sits on', () => {
      const zero = { names: { c: 0 }, cells: {} };
      expect(evaluateFormula('IF(c>0,1,0)', zero)).toBe(0);
      expect(evaluateFormula('IF(c>0,1,0)', { names: { c: 1 }, cells: {} })).toBe(1);
    });

    it('binds looser than arithmetic, so the operands are whole expressions', () => {
      // `2*3>asm_b` must read as `(2*3)>asm_b`, not `2*(3>asm_b)`.
      expect(evaluateFormula('IF(2*3>asm_b,1,0)', ctx)).toBe(1);
    });

    it('nests, which is the shape the Metros live row actually emits', () => {
      const on = { names: {}, cells: { 'Totals!B4': 'YES' as unknown as number, 'M!B8': 43 } };
      const off = { names: {}, cells: { 'Totals!B4': 'NO' as unknown as number, 'M!B8': 43 } };
      const empty = { names: {}, cells: { 'Totals!B4': 'YES' as unknown as number, 'M!B8': 0 } };
      const f = 'IF(Totals!B4="NO",0,IF(M!B8>0,1,0))';
      expect(evaluateFormula(f, on)).toBe(1);
      expect(evaluateFormula(f, off)).toBe(0);
      // The case that makes 2026 read 2 rather than 4: toggle on, metro not entered yet.
      expect(evaluateFormula(f, empty)).toBe(0);
    });

    it('does not silently treat text as orderable', () => {
      // `Number("NO")` is NaN and every comparison against NaN is false. A toggle cell can
      // hold text, so a `>` that quietly collated strings would answer a question nobody
      // asked. False is the honest answer here; guessing is not.
      const text = { names: {}, cells: { 'Totals!B4': 'NO' as unknown as number } };
      expect(evaluateFormula('IF(Totals!B4>0,1,0)', text)).toBe(0);
    });

    it('still refuses < , which nothing emits', () => {
      expect(() => evaluateFormula('IF(asm_a<asm_b,1,0)', ctx)).toThrow(/</);
    });
  });
});

/**
 * The workbook is live: Excel and Google Sheets recalculate on open. If a formula and the
 * cached result our TypeScript computed can disagree, the workbook shows one number and
 * becomes another when someone touches it. That is worse than a values-only workbook,
 * because it looks trustworthy.
 */
/**
 * Run over BOTH builds. The public workbook is not a subset of the confidential one at the
 * row level: gating `Shared cost` and `EBITDA` out of Totals shifts every row beneath them,
 * and every cross-sheet formula on that sheet addresses rows by number. So a formula can be
 * right in one build and point at the wrong row in the other, and only checking the
 * confidential spec would never see it.
 */
describe.each([
  ['confidential', true],
  ['public', false],
] as const)('every formula agrees with its cached result (%s build)', (_name, confidential) => {
  const spec = buildWorkbookSpec({ confidential });
  const ctx = collectFormulaContext(spec);

  it('finds formulas to check', () => {
    const count = spec.flatMap((s) => s.rows.flat()).filter((c) => c.f !== undefined).length;
    expect(count, 'Task 7 is not done if there are no formulas').toBeGreaterThan(20);
  });

  it('evaluates each formula to the number the sheet displays', () => {
    const mismatches: string[] = [];
    for (const sheet of spec) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.f === undefined) return;
          const cached = cell.v as number;
          let computed: number;
          try {
            computed = evaluateFormula(cell.f, ctx);
          } catch (err) {
            mismatches.push(`${sheet.name}!R${r + 1}C${c + 1}: ${(err as Error).message}`);
            return;
          }
          if (Math.abs(computed - cached) > Math.max(1e-6, Math.abs(cached) * 1e-9)) {
            mismatches.push(
              `${sheet.name}!R${r + 1}C${c + 1}: formula "${cell.f}" gives ${computed}, cache says ${cached}`,
            );
          }
        });
      });
    }
    expect(
      mismatches,
      `${mismatches.length} formula(s) disagree with their cached result. A reader who opens ` +
        `this workbook sees the cache; a reader who edits anything sees the formula.\n` +
        mismatches.slice(0, 30).join('\n'),
    ).toEqual([]);
  });
});

/**
 * The README tells a reader to switch metros in and out with the YES/NO cells on Totals, so
 * every consolidated row must actually respond to them.
 *
 * This exists because one did not. `Exit ARR` shipped as a plain value, which meant switching
 * Manhattan off dropped booked revenue by about a third while Exit ARR — and the prior-plan
 * cross-check multiple computed from it — sat still. Nothing failed: the row had no formula, so
 * the agreement test above had nothing to check, and a static cell agrees with its own cache
 * trivially. **A test that only checks formulas cannot see a row that stopped being one.**
 */
describe.each([
  ['confidential', true],
  ['public', false],
] as const)('the consolidated rows respond to the Include? toggles (%s build)', (_name, conf) => {
  // Both builds, because the public workbook is the one that gets distributed widely and its
  // Totals sheet has a different row layout — every label below must be live in each.
  const spec = buildWorkbookSpec({ confidential: conf });
  const totals = spec.find((s) => s.name === 'Totals')!;
  const ctx = collectFormulaContext(spec);

  /** The B-column cells holding `YES` are the per-metro toggles. */
  const toggleCells = totals.rows
    .map((row, r) => ({ addr: `Totals!B${r + 1}`, isToggle: row[1]?.v === 'YES' }))
    .filter((x) => x.isToggle)
    .map((x) => x.addr);

  it('finds the toggles it is about to exercise', () => {
    expect(toggleCells.length, 'no YES toggles on Totals — this suite would prove nothing').toBeGreaterThan(1);
  });

  // `Metros live` was the fourth. It shipped as a plain value on a justification that was
  // already false — the cohort's metro count IS on the Assumptions sheet as a named cell —
  // so switching a metro off dropped revenue, Exit ARR and Metro EBITDA while the summary
  // underneath went on claiming the metro was live.
  for (const label of ['Total revenue (booked in year)', 'Exit ARR', 'Metro EBITDA', 'Metros live']) {
    it(`"${label}" moves when a metro is switched off`, () => {
      const rowIndex = totals.rows.findIndex((r) => r[0]?.v === label);
      expect(rowIndex, `no row labelled "${label}" on Totals`).toBeGreaterThanOrEqual(0);

      // Final model year: every metro is live by then, so switching any one off must move it.
      const cell = totals.rows[rowIndex][totals.rows[rowIndex].length - 1];
      expect(
        cell.f,
        `"${label}" is a plain value, so the toggles cannot reach it. That is the defect this ` +
          'suite exists for — make it a formula summing the per-metro rows, do not delete this test.',
      ).toBeDefined();

      const col = String.fromCharCode('A'.charCodeAt(0) + totals.rows[rowIndex].length - 1);
      const target = `Totals!${col}${rowIndex + 1}`;

      /**
       * Re-evaluate every Totals formula top to bottom with one toggle flipped, feeding each
       * result back in, then read the target.
       *
       * A single-formula evaluation is NOT enough and getting that wrong is instructive: the
       * revenue row reaches the toggles only INDIRECTLY, by summing per-metro rows that each
       * carry their own `IF(...="NO",0,...)`. Patching the toggle and re-running just the
       * aggregate reads those per-metro cells from the stale cache, so the row looks frozen
       * when it is not. Rows are emitted with dependencies above dependents, so one ordered
       * pass settles it.
       */
      const evalWithToggle = (offAddr: string | null): number => {
        const cells: Record<string, number> = { ...ctx.cells };
        if (offAddr) cells[offAddr] = 'NO' as unknown as number;
        totals.rows.forEach((row, r) => {
          row.forEach((c, i) => {
            if (c.f === undefined) return;
            const addr = `Totals!${String.fromCharCode('A'.charCodeAt(0) + i)}${r + 1}`;
            cells[addr] = evaluateFormula(c.f, { ...ctx, cells });
          });
        });
        return cells[target];
      };

      const base = evalWithToggle(null);
      expect(base, `${target} did not evaluate`).toBeTypeOf('number');
      const moved = toggleCells.filter((addr) => evalWithToggle(addr) !== base);
      expect(
        moved.length,
        `switching any single metro off left "${label}" unchanged at ${base}`,
      ).toBeGreaterThan(0);
    });
  }
});
