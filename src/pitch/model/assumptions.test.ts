import { describe, it, expect } from 'vitest';
import { findStale, MAX_MEASURED_AGE_DAYS } from './types';
import { REGISTER, PRICING, TIER_TAKE_RATES, MARKET } from './assumptions';

describe('the assumptions register', () => {
  it('has no stale MEASURED rows', () => {
    const stale = findStale(REGISTER, new Date(), MAX_MEASURED_AGE_DAYS);
    const report = stale
      .map((s) => `  ${s.key} (${s.label}) is ${s.ageDays} days old, read ${s.asOf}\n    re-read: ${s.source}`)
      .join('\n');
    expect(
      stale,
      `${stale.length} measured input(s) are over ${MAX_MEASURED_AGE_DAYS} days old.\n` +
        `Re-read each source, update its value and asOf in src/pitch/model/assumptions.ts, ` +
        `then re-run \`npm run model:doc\`.\n${report}`,
    ).toEqual([]);
  });

  // Whether a source is re-runnable is not decidable from punctuation -- `npx vitest run` is
  // about as re-runnable as a source gets and contains neither a slash nor a pipe. So this
  // detects the failure mode actually worth catching: a source that is prose.
  const VAGUE = [/estimat/i, /approx/i, /roughly/i, /from memory/i, /founder said/i, /we think/i, /internal knowledge/i];

  it('gives every MEASURED row a concrete source rather than a prose description', () => {
    for (const [key, a] of Object.entries(REGISTER)) {
      if (a.provenance !== 'MEASURED') continue;
      expect(a.source.trim().length, `${key}: source is too short to be real`).toBeGreaterThan(8);
      for (const pattern of VAGUE) {
        expect(pattern.test(a.source), `${key}: source "${a.source}" reads as prose, not a source`).toBe(false);
      }
    }
  });

  it('matches the take-rate ladder that is live in platform-fee.ts', () => {
    expect(TIER_TAKE_RATES.free.value).toBe(0.10);
    expect(TIER_TAKE_RATES.starter.value).toBe(0.07);
    expect(TIER_TAKE_RATES.growth.value).toBe(0.05);
    expect(TIER_TAKE_RATES.pro.value).toBe(0.03);
  });

  it('matches the subscription prices that are live in STRIPE_PRICES.md', () => {
    expect(PRICING.free.value).toBe(0);
    expect(PRICING.starter.value).toBe(149);
    expect(PRICING.growth.value).toBe(449);
    expect(PRICING.pro.value).toBe(899);
  });

  // The tier mix drives 78% of headline revenue at 100 businesses ($21,680 of $27,755) and used
  // to live as an untagged literal in scripts/generate-investor-model.ts. Registered 2026-08-23.
  // A mix that silently doesn't sum to 1 understates or overstates every revenue figure derived
  // from it, the same failure mode `assertMixSumsToOne` in project.ts guards against at runtime.
  it('sums the tier mix to exactly 1', () => {
    const total =
      MARKET.tierMixFree.value + MARKET.tierMixStarter.value + MARKET.tierMixGrowth.value + MARKET.tierMixPro.value;
    expect(total).toBeCloseTo(1, 10);
  });
});
