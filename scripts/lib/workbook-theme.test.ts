/**
 * The theme decorates; it must never change what the workbook SAYS.
 *
 * That is the whole risk of this file. Fonts and fills are cosmetic and a wrong one is
 * obvious the moment anyone opens the sheet — but a number format is presentation that is
 * fully capable of lying (`0.029` rendered `3%`), a merge can hide a cell that had content in
 * it, and both are invisible to every other test in this directory, all of which read the
 * SPEC rather than the written file.
 *
 * So the control here is a round trip: build the spec, write it exactly the way
 * `generate-financial-model-xlsx.ts` does, apply the theme, then read every cell back and
 * compare it to the spec it came from.
 */
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookSpec, type CellRole, type SheetSpec } from '../../src/pitch/model/workbook';
import { ROLE_STYLE, applyTheme, provenanceColor, withNegativeStyle } from './workbook-theme';

/**
 * Every role the spec can emit. Written out rather than derived, because deriving it from
 * `ROLE_STYLE`'s own keys would make the coverage test below compare the map to itself.
 */
const ALL_ROLES: readonly CellRole[] = [
  'title',
  'subtitle',
  'header',
  'section',
  'note',
  'input',
  'total',
  'headline',
  'provenance',
];

/** The writer's value/format loop, minus the theme — the thing under test is what comes after. */
function write(spec: readonly SheetSpec[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const sheet of spec) {
    const ws = wb.addWorksheet(sheet.name);
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const target = ws.getCell(r + 1, c + 1);
        if (cell.f !== undefined) target.value = { formula: cell.f, result: cell.v as number };
        else if (cell.v !== null) target.value = cell.v;
        if (cell.fmt) target.numFmt = withNegativeStyle(cell.fmt) as string;
      });
    });
    applyTheme(ws, sheet);
  }
  return wb;
}

describe('workbook theme', () => {
  const spec = buildWorkbookSpec({ confidential: true });

  it('styles every role the spec can emit', () => {
    for (const role of ALL_ROLES) {
      const style = ROLE_STYLE[role];
      expect(style, `no style for role "${role}"`).toBeDefined();
      expect(Object.keys(style).length, `role "${role}" is styled with nothing`).toBeGreaterThan(0);
    }
  });

  it('leaves every value and formula exactly as the spec wrote it', () => {
    const wb = write(spec);
    let checked = 0;

    for (const sheet of spec) {
      const ws = wb.getWorksheet(sheet.name)!;
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          const got = ws.getCell(r + 1, c + 1).value;
          if (cell.f !== undefined) {
            expect((got as { formula: string }).formula).toBe(cell.f);
            // A cached result of ZERO comes back undefined, and that is exceljs, not the
            // theme — it is the same before and after `applyTheme`, and the real writer has
            // always behaved this way. Harmless in practice because Excel and Sheets both
            // recalculate on open; worth knowing before trusting a cached value read out of
            // this file by anything that does not.
            const result = (got as { result?: number }).result;
            if (cell.v === 0) expect(result ?? 0).toBe(0);
            else expect(result).toBe(cell.v);
          } else if (cell.v !== null) {
            // A merged note keeps its text in the top-left cell; only the cells it swallowed
            // go null, and those were empty in the spec.
            expect(got, `${sheet.name}!R${r + 1}C${c + 1}`).toBe(cell.v);
          }
          checked += 1;
        });
      });
    }

    // Without this the assertion above passes on an empty workbook, which is exactly the
    // failure mode `verify-public-bundle.ts` records: a check whose subject went missing.
    expect(checked).toBeGreaterThan(1000);
  });

  it('never changes what a number format shows for a positive value', () => {
    const wb = write(spec);
    for (const sheet of spec) {
      const ws = wb.getWorksheet(sheet.name)!;
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (!cell.fmt) return;
          const got = ws.getCell(r + 1, c + 1).numFmt;
          expect(got.split(';')[0], `${sheet.name}!R${r + 1}C${c + 1}`).toBe(cell.fmt);
        });
      });
    }
  });

  it('adds a red bracketed negative only to bare $ formats', () => {
    expect(withNegativeStyle('$#,##0')).toBe('$#,##0;[Red]($#,##0)');
    // Percentages and counts are not money; brackets would be noise.
    expect(withNegativeStyle('0.0%')).toBe('0.0%');
    expect(withNegativeStyle('#,##0')).toBe('#,##0');
    // A format that already states its own sections has SAID what it wants for negatives.
    expect(withNegativeStyle('$#,##0;(0)')).toBe('$#,##0;(0)');
    expect(withNegativeStyle(undefined)).toBeUndefined();
  });

  it('colours a provenance tag by its value and leaves an unknown one plain', () => {
    expect(provenanceColor('MEASURED')).toBeDefined();
    expect(provenanceColor('MODELED')).toBeDefined();
    expect(provenanceColor('BENCHMARKED')).toBeDefined();
    // Three tags must not share one colour, or the cell carries no information.
    const known = new Set([provenanceColor('MEASURED'), provenanceColor('MODELED'), provenanceColor('BENCHMARKED')]);
    expect(known.size).toBe(3);
    expect(provenanceColor('ASSUMED')).toBeUndefined();
  });

  it('marks as editable exactly the cells a reader is told to change, and no others', () => {
    const inputs: string[] = [];
    for (const sheet of spec) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.role === 'input') inputs.push(`${sheet.name}!R${r + 1}C${c + 1}`);
        });
      });
    }
    // The README promises two editable surfaces: the Assumptions sheet's value column and
    // the Totals YES/NO toggles. A third would be a promise nothing made.
    const sheets = new Set(inputs.map((a) => a.split('!')[0]));
    expect([...sheets].sort()).toEqual(['Assumptions', 'Totals']);
    expect(inputs.length).toBeGreaterThan(50);
  });

  it('merges a prose row across the sheet so it cannot be clipped at column A', () => {
    const wb = write(spec);
    const ws = wb.getWorksheet('Hoboken_Model')!;
    const noteRow = spec
      .find((s) => s.name === 'Hoboken_Model')!
      .rows.findIndex((row) => row[0]?.role === 'note');
    expect(noteRow).toBeGreaterThan(-1);
    expect(ws.getCell(noteRow + 1, 1).isMerged).toBe(true);
  });

  it('freezes the label column and the header row on a data sheet, and neither on a prose sheet', () => {
    const wb = write(spec);
    const data = wb.getWorksheet('Totals')!.views[0] as { xSplit?: number; ySplit?: number };
    expect(data.xSplit).toBe(1);
    expect(data.ySplit).toBe(1);
    const prose = wb.getWorksheet('README')!.views[0] as { xSplit?: number; ySplit?: number };
    expect(prose.xSplit).toBe(0);
    expect(prose.ySplit).toBe(0);
  });
});
