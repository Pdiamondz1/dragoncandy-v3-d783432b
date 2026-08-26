import { describe, it, expect } from 'vitest';
import {
  SIZE_BUCKETS,
  resolveSuppressed,
  bucketSum,
  bandFloorAcross,
  loadCensusSnapshot,
  snapshotFor,
  type NaicsRow,
} from './censusTam';

function row(naics: string, establishments: number, partial: Partial<NaicsRow['buckets']>): NaicsRow {
  const buckets = Object.fromEntries(SIZE_BUCKETS.map((b) => [b, 0])) as NaicsRow['buckets'];
  return { naics, establishments, buckets: { ...buckets, ...partial } };
}

describe('census suppression', () => {
  // Hoboken 722410 in the 2022 ZBP: est 22, under-5 suppressed, 5/8/6 in the next three.
  // 22 - 5 - 8 - 6 = 3, so the suppressed cell is recoverable exactly.
  it('recovers a single suppressed bucket as the residual', () => {
    const r = row('722410', 22, { lt5: null, b5_9: 5, b10_19: 8, b20_49: 6 });
    expect(resolveSuppressed(r).buckets.lt5).toBe(3);
  });

  it('leaves the buckets alone when two are suppressed', () => {
    const r = row('722511', 30, { lt5: null, b5_9: null, b10_19: 8, b20_49: 6 });
    const out = resolveSuppressed(r);
    expect(out.buckets.lt5).toBeNull();
    expect(out.buckets.b5_9).toBeNull();
  });

  it('never turns a suppressed cell into a zero', () => {
    const r = row('722515', 43, { lt5: null, b5_9: null, b10_19: null });
    for (const b of ['lt5', 'b5_9', 'b10_19'] as const) {
      expect(resolveSuppressed(r).buckets[b]).toBeNull();
    }
  });

  // A residual that comes out negative means the row does not add up -- bad parse, wrong
  // column offset, or a vintage whose layout moved. Silently clamping it to 0 would hide
  // exactly the failure this is meant to surface.
  it('throws when the residual would be negative', () => {
    const r = row('722511', 5, { lt5: null, b5_9: 9 });
    expect(() => resolveSuppressed(r)).toThrow(/residual/i);
  });
});

describe('bucketSum', () => {
  it('adds the named buckets', () => {
    const r = row('722511', 97, { lt5: 17, b5_9: 19, b10_19: 23, b20_49: 34, b50_99: 4 });
    expect(bucketSum(r, ['b5_9', 'b10_19', 'b20_49'])).toBe(76);
  });

  // Two buckets must be null here, not one: resolveSuppressed force-resolves a row with
  // exactly one suppressed cell (that's its whole point -- see the "recovers a single
  // suppressed bucket" test above), so a single-null row never stays suppressed and this
  // test's premise would never hold. With two null, the split is genuinely unrecoverable.
  it('throws rather than undercounting when a needed bucket is suppressed', () => {
    const r = row('722511', 97, { lt5: null, b5_9: null, b10_19: 23 });
    expect(() => bucketSum(r, ['b5_9', 'b10_19'])).toThrow(/suppressed/i);
  });
});

describe('the committed snapshot', () => {
  const snapshot = loadCensusSnapshot();

  it('covers the three single-geography metros', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      expect(snapshotFor(snapshot, id).rows.length).toBeGreaterThan(0);
    }
  });

  // A zipset carries its rows in `parts`, one entry per constituent ZIP, and its own `rows`
  // stays empty -- the summing lives in censusTam.ts where CI tests it, not in the JSON.
  it('carries the Hamptons as fourteen parts, two of them absent', () => {
    const snap = snapshotFor(snapshot, 'montauk-hamptons');
    expect(snap.rows).toEqual([]);
    expect(snap.parts).toBeDefined();
    expect(snap.parts!.length).toBe(14);
    const absent = snap.parts!.filter((p) => p.rows.length === 0).map((p) => p.code);
    // Absent is NOT zero. 11959 Quogue and 11962 Sagaponack have no ZBP rows at all, and
    // they stay in the list so a reader sees the constituent list was 14 and 12 answered.
    expect(absent.sort()).toEqual(['11959', '11962']);
  });

  it('leaves every single-geography metro without a parts key at all', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      expect(snapshotFor(snapshot, id).parts).toBeUndefined();
    }
  });

  it('records a vintage, a source URL and a fetch date for every metro', () => {
    for (const m of snapshot.metros) {
      expect(m.vintage).toBeGreaterThanOrEqual(2022);
      expect(m.sourceUrl).toMatch(/^https:\/\/www2\.census\.gov\//);
      expect(m.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // The brief was written against the 2022 ZBP (722511=97, 722410=22, 722515=43). The newest
  // vintage the fetch script found on the live Census servers was 2023 -- 2024/2025/2026 all
  // 404 -- so these are the 2023 figures instead. A vintage moving under you and changing the
  // count is the script working correctly, not a bug; see scripts/fetch-census-tam.ts's header.
  it('carries the Hoboken counts read during design', () => {
    const rows = snapshotFor(snapshot, 'hoboken').rows;
    const byNaics = Object.fromEntries(rows.map((r) => [r.naics, r.establishments]));
    expect(byNaics['722511']).toBe(102);
    expect(byNaics['722410']).toBe(24);
    expect(byNaics['722515']).toBe(41);
  });

  it('has every bucket total reconcile to the establishment count', () => {
    for (const m of snapshot.metros) {
      // A zipset's rows live in `parts`; walking only `m.rows` would silently check nothing
      // for it, which is the shape of a green test that inspects an empty list.
      const allRows = [...m.rows, ...(m.parts ?? []).flatMap((p) => p.rows)];
      expect(allRows.length, `${m.metroId} has no rows to reconcile`).toBeGreaterThan(0);
      for (const r of allRows) {
        const resolved = resolveSuppressed(r);
        const known = SIZE_BUCKETS.map((b) => resolved.buckets[b]).filter((v): v is number => v !== null);
        const suppressed = SIZE_BUCKETS.length - known.length;
        const total = known.reduce((a, b) => a + b, 0);
        if (suppressed === 0) {
          expect(total, `${m.metroId} ${r.naics}`).toBe(r.establishments);
        } else {
          expect(total, `${m.metroId} ${r.naics}`).toBeLessThanOrEqual(r.establishments);
        }
      }
    }
  });
});

describe('bandFloorAcross', () => {
  const naics = ['722511'];
  const band = ['b5_9', 'b10_19', 'b20_49'] as const;

  it('sums the known buckets across geographies', () => {
    const a = [row('722511', 20, { lt5: 5, b5_9: 6, b10_19: 4, b20_49: 5 })];
    const b = [row('722511', 12, { lt5: 2, b5_9: 3, b10_19: 4, b20_49: 3 })];
    expect(bandFloorAcross([a, b], naics, [...band])).toEqual({ value: 25, suppressedCells: 0 });
  });

  /**
   * The order rule, as a test. Montauk's shape: ONE suppressed bucket, so its value is forced
   * by the establishment total. Water Mill's shape: TWO, so it is not. If this summed the raw
   * rows first, the recoverable cell would collapse into the same "unknown" as the
   * unrecoverable one and be lost for nothing -- so the floor would come out LOWER and the
   * suppressed-cell count HIGHER. Both halves are asserted, because a test on the value alone
   * would pass on an implementation that happened to be off in a compensating direction.
   */
  it('resolves per geography BEFORE summing, so a forced bucket is recovered', () => {
    const forced = [row('722511', 20, { lt5: 5, b5_9: null, b10_19: 4, b20_49: 5 })]; // b5_9 = 6
    const unrecoverable = [row('722511', 12, { lt5: null, b5_9: null, b10_19: 4, b20_49: 3 })];
    expect(bandFloorAcross([forced, unrecoverable], naics, [...band])).toEqual({
      value: 6 + 4 + 5 + 4 + 3,
      suppressedCells: 1,
    });
  });

  it('treats a missing NAICS row as nothing there, not as a suppressed cell', () => {
    const noBars = [row('722511', 10, { lt5: 2, b5_9: 3, b10_19: 3, b20_49: 2 })];
    expect(bandFloorAcross([noBars], ['722511', '722410'], [...band])).toEqual({
      value: 8,
      suppressedCells: 0,
    });
  });

  // The divergence from bucketSum, pinned. bucketSum THROWS on an unrecoverable bucket
  // (right for one geography); this returns a floor and says how much is hidden (right for a
  // set). If someone ever "fixed" this to throw, a real market would become unmodelable.
  it('returns a floor rather than throwing, unlike bucketSum on the same row', () => {
    const rows = [row('722511', 12, { lt5: null, b5_9: null, b10_19: 4, b20_49: 3 })];
    expect(() => bucketSum(rows[0], [...band])).toThrow(/suppressed/i);
    const out = bandFloorAcross([rows], naics, [...band]);
    expect(out.value).toBe(7);
    expect(out.suppressedCells).toBe(1);
  });
});

describe('the Hamptons floor, against the figures read by hand from the 2023 ZBP', () => {
  const snap = snapshotFor(loadCensusSnapshot(), 'montauk-hamptons');

  // Read independently off the ZBP before this code existed. If the parser, the ZIP list or
  // the vintage moves, these fail rather than quietly restating whatever the code produced.
  const EXPECTED_TOTAL: Readonly<Record<string, number | null>> = {
    '11968': 67, '11946': 56, '11937': 59, '11978': 40, '11963': 36, '11954': 62,
    '11932': 20, '11976': 14, '11930': 19, '11942': 12, '11975': 5, '11977': 6,
    '11959': null, '11962': null,
  };

  it('matches the per-ZIP food-service totals read by hand', () => {
    for (const p of snap.parts!) {
      const row722 = p.rows.find((r) => r.naics === '722');
      expect(row722?.establishments ?? null, `${p.code} ${p.label}`).toBe(EXPECTED_TOTAL[p.code]);
    }
  });

  it('sums to 396 venues across the set', () => {
    const total = snap.parts!.reduce(
      (s, p) => s + (p.rows.find((r) => r.naics === '722')?.establishments ?? 0),
      0,
    );
    expect(total).toBe(396);
  });
});
