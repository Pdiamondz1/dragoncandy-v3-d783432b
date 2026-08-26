import { describe, it, expect } from 'vitest';
import {
  SIZE_BUCKETS,
  resolveSuppressed,
  bucketSum,
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

  it('covers the three named metros', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      expect(snapshotFor(snapshot, id).rows.length).toBeGreaterThan(0);
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
      for (const r of m.rows) {
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
