import { describe, it, expect } from 'vitest';
import { MIN_POSTS_FOR_SIGNAL, assessSignal, unattributableSignal } from './social-signal';

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

describe('unattributableSignal', () => {
  it('never claims a signal, however large the sample', () => {
    // This is the whole point: the sample can be enormous and still say nothing
    // about the account being reported on.
    for (const n of [0, 1, 3, 50, 5000]) {
      expect(unattributableSignal(n).hasSignal).toBe(false);
    }
  });

  it('reports the count honestly — the attribution failed, not the measurement', () => {
    expect(unattributableSignal(1).caveat).toContain('1 measured post ');
    expect(unattributableSignal(4).caveat).toContain('4 measured posts ');
    expect(unattributableSignal(4).caveat).toContain('more than one connected account shares it');
  });

  it('floors an invalid count the same way assessSignal does', () => {
    expect(unattributableSignal(-2).n).toBe(0);
    expect(unattributableSignal(Number.NaN).n).toBe(0);
  });
});
