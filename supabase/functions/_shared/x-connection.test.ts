import { describe, expect, it } from 'vitest';
import {
  INSIGHTS_CACHE_SECONDS,
  isCacheUsable,
  isFresh,
  REFRESH_SKEW_SECONDS,
} from './x-connection.ts';

/**
 * These are real execution tests, not text assertions — both helpers are pure
 * and reachable under Node. Where `x-oauth.test.ts` has to read source text
 * because the module touches `Deno.env`, this file does not, so it asserts
 * behaviour.
 *
 * Both functions answer a question where one of the two wrong answers is much
 * more expensive than the other, and the tests below are mostly about pinning
 * WHICH way each fails.
 */

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

describe('isFresh', () => {
  it('accepts a token with plenty of life left', () => {
    expect(isFresh(iso(60 * 60 * 1000))).toBe(true);
  });

  it('rejects one that has already expired', () => {
    expect(isFresh(iso(-1000))).toBe(false);
  });

  it('rejects one inside the skew window', () => {
    // The point of the skew: a token with 30 seconds left is technically valid
    // and will expire mid-request. Refreshing early costs one call; not doing so
    // costs a confusing 401 the user sees.
    expect(isFresh(iso(30 * 1000))).toBe(false);
    expect(REFRESH_SKEW_SECONDS).toBe(120);
  });

  it('treats an unparseable timestamp as STALE, never fresh', () => {
    // MEASURED, because the obvious reading of this test is wrong.
    //
    // Deleting `isFresh`'s `Number.isNaN` guard does NOT fail this test: every
    // comparison with NaN is false, so `t > cutoff` already returns false. On
    // that evidence alone the guard looks redundant and the test looks like it
    // pins nothing — the "green pin holding a value nothing reads" this project
    // keeps finding.
    //
    // It is not redundant, and the control that shows why is a REWRITE rather
    // than a deletion. `!(t <= cutoff)` is the same function for every real
    // date and returns TRUE for NaN, because the false comparison gets negated.
    // Forced control, 2026-08-24: guard removed + that rewrite → this test
    // FAILS; guard kept + the same rewrite → passes.
    //
    // So the guard's value is that it makes the answer independent of how the
    // comparison happens to be written, and this test is what detects its
    // absence. **A control that only deletes code cannot see a guard whose job
    // is to survive a refactor** — mutate toward the plausible mistake, not
    // toward nothing.
    expect(isFresh('not a date')).toBe(false);
    expect(isFresh('')).toBe(false);
  });
});

describe('isCacheUsable', () => {
  it('serves a snapshot taken a moment ago', () => {
    expect(isCacheUsable(iso(-1000))).toBe(true);
  });

  it('refuses one older than the window', () => {
    expect(isCacheUsable(iso(-(INSIGHTS_CACHE_SECONDS + 60) * 1000))).toBe(false);
  });

  it('refuses when there is no snapshot at all', () => {
    expect(isCacheUsable(null)).toBe(false);
  });

  it('treats an unparseable timestamp as UNUSABLE', () => {
    // Same measured story as `isFresh` above — `!(age >= max)` returns true for
    // NaN and this test catches it only when the guard is gone. Verified by
    // forced control on both halves.
    //
    // The direction matters for a different reason here: the cheap wrong answer
    // is paying for one extra read, and the expensive one is serving numbers we
    // cannot date as if they were current. A figure whose age is unknown is not
    // a figure.
    expect(isCacheUsable('not a date')).toBe(false);
  });

  it('caches for fifteen minutes, which is a cost control and not a perf tweak', () => {
    // X bills per read; the other three connectors' insights are free. If this
    // number is ever lowered, it is a spending decision.
    expect(INSIGHTS_CACHE_SECONDS).toBe(900);
  });
});
