import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec, SHEET_ORDER, FINANCING_SHEET } from './workbook';
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS, METROS, addressableBand } from './metros';

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

  /**
   * A floor printed as if it were a count is a lie by formatting, and the lie is invisible
   * exactly where it matters -- a reader sees "97" beside Hoboken's "123" and has no way to
   * know one of them is a lower bound. So the range must travel with the figure to EVERY
   * sheet that prints it, not just to the one someone remembered.
   *
   * The search is over sheets that actually contain the number, derived from the model, not
   * over a hand-listed pair of sheet names -- a list is the thing that goes stale when a
   * fifth surface starts showing the count.
   */
  describe('a floored addressable count never appears without its range', () => {
    const floored = METROS.filter((m) => addressableBand(m.id).suppressedCells > 0);

    it('CONTROL: at least one metro has a floored count, so this checks something', () => {
      // Without this, every assertion below is vacuously true the day the Hamptons is
      // removed or its suppression disappears -- a green test inspecting an empty list.
      expect(floored.map((m) => m.id)).toEqual(['montauk-hamptons']);
    });

    it.each(floored.map((m) => [m.id] as const))(
      'states the range on every sheet showing %s\'s addressable count',
      (metroId) => {
        const band = addressableBand(metroId);
        // Located by ROW LABEL, not by numeric equality against the count itself. Matching on
        // `c.v === band.value` reports any unrelated cell that happens to equal 97, and skips a
        // floored count emitted as a FORMULA entirely — so it could go quiet in exactly the
        // case it exists to catch. The label is the thing that makes a cell "the addressable
        // count"; the value is a coincidence a reader cannot rely on.
        const showing = confidential.filter((sheet) =>
          sheet.rows.some(
            (r) =>
              String(r[0]?.v ?? '').startsWith('Addressable venues') &&
              r.slice(1).some((c) => c.v === band.value || c.f !== undefined),
          ),
        );
        expect(showing.length, `no sheet prints ${metroId}'s count at all`).toBeGreaterThan(0);

        const silent = showing
          .filter((sheet) => {
            const text = sheet.rows.flat().map((c) => String(c.v ?? '')).join(' ');
            return !(
              text.includes(`at least ${band.value}`) &&
              text.includes(`${band.suppressedCells} suppressed`)
            );
          })
          .map((s) => s.name);

        expect(
          silent,
          `These sheets print ${metroId}'s addressable count as a bare number. It is a FLOOR ` +
            `(${band.suppressedCells} suppressed Census cells excluded), so the range must ` +
            `travel with it -- use describeAddressable() from metros.ts rather than writing ` +
            `the wording again.`,
        ).toEqual([]);
      },
    );
  });

  it('omits the Financing sheet from a public build', () => {
    const publicSpec = buildWorkbookSpec({ confidential: false });
    expect(publicSpec.map((s) => s.name)).not.toContain(FINANCING_SHEET);
    expect(confidential.map((s) => s.name)).toContain(FINANCING_SHEET);
  });
});
