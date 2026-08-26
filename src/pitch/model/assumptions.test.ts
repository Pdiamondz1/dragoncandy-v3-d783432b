import { describe, it, expect } from 'vitest';
import { findStale, MAX_MEASURED_AGE_DAYS } from './types';
import { REGISTER, PRICING, TIER_TAKE_RATES, MARKET, CALENDAR, TRAJECTORY } from './assumptions';
import { MODEL_YEARS } from './metros';

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

  /**
   *2026 = Year 1 was an UNSTATED DEFAULT under every figure in the deck until 2026-08-26.
   * PROJECT_CONTEXT section 4 says production launch is TBD, so nothing in the repo said
   * which calendar year the Y1/Y2/Y3 bands land on -- and if it were 2027, every year label
   * on the trajectory slide is off by one and the cross-check compares the wrong rows.
   *
   * Tied to `MODEL_YEARS` rather than asserted as a bare 2026, so the registered value and
   * the horizon the model actually walks cannot drift apart: moving one without the other
   * fails here.
   */
  /**
   * THE CROSS-CHECK MUST NOT BE ABLE TO PASS BY FIAT.
   *
   * PROJECT_CONTEXT section 3 was restated on 2026-08-26 to this model's own bottom-up
   * figures. The obvious follow-on edit -- updating these six registered values to match --
   * would make `bottomUpVsPriorPlan` exactly 1.00 every year BY CONSTRUCTION, make the
   * trajectory slide's own sentence ("a cross-check, not a number this build was tuned to
   * meet") false, and satisfy the spec's "the gap is reported, never closed" rule by fiat.
   *
   * So the six values are pinned at the SUPERSEDED plan's numbers. If the prior plan itself
   * is ever genuinely restated -- a different question -- this test is the place to record
   * that, deliberately, with the reason.
   */
  it('keeps the superseded plan\'s band at its ORIGINAL values, never the restated ones', () => {
    expect(TRAJECTORY.year1RevenueLow.value).toBe(300_000);
    expect(TRAJECTORY.year1RevenueHigh.value).toBe(600_000);
    expect(TRAJECTORY.year2RevenueLow.value).toBe(2_000_000);
    expect(TRAJECTORY.year2RevenueHigh.value).toBe(4_500_000);
    expect(TRAJECTORY.year3RevenueLow.value).toBe(7_000_000);
    expect(TRAJECTORY.year3RevenueHigh.value).toBe(12_000_000);
  });

  /**
   * ...and they must not be sourced to the document they now supersede. PROJECT_CONTEXT
   * section 3 quotes the MODEL as of 2026-08-26, so a cross-check citing section 3 would be
   * the model checking itself through one extra hop -- circular, and invisible in the value.
   */
  it('sources the band to the archive narrative, not to the section it superseded', () => {
    for (const key of ['year1RevenueLow', 'year1RevenueHigh', 'year2RevenueLow',
                       'year2RevenueHigh', 'year3RevenueLow', 'year3RevenueHigh'] as const) {
      expect(TRAJECTORY[key].source, key).toMatch(/docs\/archive\//);
      expect(TRAJECTORY[key].source, key).toMatch(/before 2026-08-26/);
      expect(TRAJECTORY[key].label, key).toMatch(/superseded/i);
      // The label must say ARR, because the value IS ARR and the model compares exit ARR
      // against it. A label reading "revenue" is what let booked revenue be divided by it.
      expect(TRAJECTORY[key].label, key).toMatch(/ARR/);
    }
  });

  it('states which calendar year is Year 1, and agrees with MODEL_YEARS', () => {
    expect(CALENDAR.year1CalendarYear.value).toBe(MODEL_YEARS[0]);
    expect(REGISTER.year1CalendarYear).toBe(CALENDAR.year1CalendarYear);
    // Founder-confirmed, so the source must name a person and a date -- not a document.
    expect(CALENDAR.year1CalendarYear.source).toMatch(/founder confirmation/i);
    expect(CALENDAR.year1CalendarYear.source).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
