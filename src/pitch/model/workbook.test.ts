import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec, SHEET_ORDER, FINANCING_SHEET } from './workbook';
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS } from './metros';

describe('the workbook spec', () => {
  const confidential = buildWorkbookSpec({ confidential: true });

  it('emits every sheet in the documented order', () => {
    expect(confidential.map((s) => s.name)).toEqual([...SHEET_ORDER]);
  });

  it('gives the Assumptions sheet a row per registered assumption', () => {
    const sheet = confidential.find((s) => s.name === 'Assumptions')!;
    const expected = Object.keys(REGISTER).length + Object.keys(METRO_ASSUMPTIONS).length;
    // Header row plus one per assumption, plus the cohort counts.
    expect(sheet.rows.length).toBeGreaterThanOrEqual(expected + 1);
  });

  it('records provenance and a source for every assumption row', () => {
    const sheet = confidential.find((s) => s.name === 'Assumptions')!;
    for (const row of sheet.rows.slice(1)) {
      const provenance = row[3]?.v;
      const source = row[4]?.v;
      expect(['MEASURED', 'BENCHMARKED', 'MODELED']).toContain(provenance);
      expect(String(source).length).toBeGreaterThan(8);
    }
  });

  it('names the Census vintage and URL on the Sources sheet', () => {
    const sheet = confidential.find((s) => s.name === 'Sources')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ');
    expect(text).toMatch(/www2\.census\.gov/);
    expect(text).toMatch(/722511/);
  });

  // Spec section 5. A reader comparing the two workbooks must not be left wondering
  // whether we forgot these rows.
  it('states which of Adrian’s blocks were omitted, and why', () => {
    const sheet = confidential.find((s) => s.name === 'Sources')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ').toLowerCase();
    for (const omitted of ['bonus', 'gaming tax', 'market access']) {
      expect(text).toContain(omitted);
    }
  });

  it('shows the addressable count beside the town-wide count on each metro sheet', () => {
    const sheet = confidential.find((s) => s.name === 'Hoboken_Model')!;
    const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ');
    expect(text).toMatch(/Addressable venues/);
    expect(text).toMatch(/food service/i);
  });

  it('omits the Financing sheet from a public build', () => {
    const publicSpec = buildWorkbookSpec({ confidential: false });
    expect(publicSpec.map((s) => s.name)).not.toContain(FINANCING_SHEET);
    expect(confidential.map((s) => s.name)).toContain(FINANCING_SHEET);
  });
});
