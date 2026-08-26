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
});

/**
 * The workbook is live: Excel and Google Sheets recalculate on open. If a formula and the
 * cached result our TypeScript computed can disagree, the workbook shows one number and
 * becomes another when someone touches it. That is worse than a values-only workbook,
 * because it looks trustworthy.
 */
describe('every formula agrees with its cached result', () => {
  const spec = buildWorkbookSpec({ confidential: true });
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
describe('the consolidated rows respond to the Include? toggles', () => {
  const spec = buildWorkbookSpec({ confidential: true });
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

  for (const label of ['Total revenue (booked in year)', 'Exit ARR', 'Metro EBITDA']) {
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
