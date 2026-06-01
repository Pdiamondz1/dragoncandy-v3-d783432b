import { describe, it, expect } from 'vitest';
import { validateCustomBoost, dollarsToCents } from './boostAmount';

describe('validateCustomBoost', () => {
  it('accepts amounts within $5–$500', () => {
    expect(validateCustomBoost(5)).toEqual({ ok: true, cents: 500 });
    expect(validateCustomBoost(42)).toEqual({ ok: true, cents: 4200 });
    expect(validateCustomBoost(500)).toEqual({ ok: true, cents: 50000 });
  });
  it('rejects below $5, above $500, and non-finite', () => {
    expect(validateCustomBoost(4).ok).toBe(false);
    expect(validateCustomBoost(501).ok).toBe(false);
    expect(validateCustomBoost(NaN).ok).toBe(false);
  });
  it('rounds to whole cents', () => {
    expect(dollarsToCents(12.349)).toBe(1235);
  });
});
