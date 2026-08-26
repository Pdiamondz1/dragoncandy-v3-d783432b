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
