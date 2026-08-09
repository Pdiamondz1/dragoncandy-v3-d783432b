import { describe, it, expect } from 'vitest';
import { MIN_POSTS_FOR_SIGNAL, assessSignal } from './social-signal';

describe('MIN_POSTS_FOR_SIGNAL', () => {
  it('is 3 — the value the rest of the product already uses', () => {
    expect(MIN_POSTS_FOR_SIGNAL).toBe(3);
  });
});

describe('assessSignal', () => {
  it('has no signal below the threshold', () => {
    for (const n of [0, 1, 2]) {
      const v = assessSignal(n);
      expect(v.hasSignal).toBe(false);
      expect(v.n).toBe(n);
    }
  });

  it('has signal at and above the threshold', () => {
    for (const n of [3, 4, 50]) {
      const v = assessSignal(n);
      expect(v.hasSignal).toBe(true);
      expect(v.n).toBe(n);
      expect(v.caveat).toBeNull();
    }
  });

  it('states the actual count in the caveat, so Donny cannot round it away', () => {
    expect(assessSignal(0).caveat).toBe(
      'Based on 0 measured posts — too few to name a trend, a best anything, or a rate. Report only the raw figures that exist.',
    );
    expect(assessSignal(1).caveat).toContain('1 measured post');
    expect(assessSignal(2).caveat).toContain('2 measured posts');
  });

  it('treats a negative or non-finite count as no signal rather than throwing', () => {
    expect(assessSignal(-1).hasSignal).toBe(false);
    expect(assessSignal(Number.NaN).hasSignal).toBe(false);
    expect(assessSignal(Number.NaN).n).toBe(0);
  });
});
