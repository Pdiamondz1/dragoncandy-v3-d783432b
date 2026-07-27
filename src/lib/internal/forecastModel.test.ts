import { describe, it, expect } from 'vitest';
import {
  buildForecast, DEFAULT_ASSUMPTIONS, FORECAST_KEYS, AI_FLOOR_USD,
  DEFAULT_DB_CONNS_PER_CONCURRENT, type ForecastMeasured,
} from './forecastModel';
import { GB } from './weightThresholds';

const measured: ForecastMeasured = {
  dbBytes: 0.5 * GB, storageBytes: 0.2 * GB, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: { honest_peak_concurrency: 4000, db_active_conn_peak: 27, max_connections: 90,
    media_bytes: 369_000_000, media_requests: 31_000 },
  currentAiSpendUsd: 225, currentOpexUsd: 390, currentRevenueUsd: 0,
};
const input = { measured, assumptions: DEFAULT_ASSUMPTIONS };

describe('buildForecast', () => {
  it('has FORECAST_KEYS matching every ForecastAssumptions field (prefix-stripped)', () => {
    const fields = Object.keys(DEFAULT_ASSUMPTIONS).sort();
    expect(FORECAST_KEYS.map((k) => k.replace(/^forecast_/, '')).sort()).toEqual(fields);
  });

  it('produces Today + three projected scenarios', () => {
    const m = buildForecast(input);
    expect(m.scenarios.map((s) => s.label)).toEqual(['Today', '500K', '750K', '1M']);
  });

  it('Today is measured — uses measured AI spend, no DAU-derived fields', () => {
    const today = buildForecast(input).scenarios[0];
    expect(today.measured).toBe(true);
    expect(today.aiUsd).toBe(225);
    expect(today.aiUncappedUsd).toBeNull();
    expect(today.costPerDauUsd).toBeNull();
    expect(today.registeredUsers).toBe(40);
    expect(today.marginPct).toBeNull(); // revenue 0
  });

  it('derives the measured connection coefficient from the load run', () => {
    const m = buildForecast(input);
    expect(m.coefficients.measuredCeiling).toBe(true);
    expect(m.coefficients.dbConnsPerConcurrent).toBeCloseTo(27 / 4000, 6);
  });

  it('falls back to defaults (and notes it) when the load matrix is null', () => {
    const m = buildForecast({ ...input, measured: { ...measured, loadMatrix: null } });
    expect(m.coefficients.measuredCeiling).toBe(false);
    expect(m.coefficients.dbConnsPerConcurrent).toBe(DEFAULT_DB_CONNS_PER_CONCURRENT);
    expect(m.notes.some((n) => /ceiling unavailable/i.test(n))).toBe(true);
  });

  it('falls back when a non-null matrix has a zero denominator (no NaN/Infinity)', () => {
    const zero = { ...measured, loadMatrix: { ...measured.loadMatrix!, honest_peak_concurrency: 0 } };
    const m = buildForecast({ ...input, measured: zero });
    expect(m.coefficients.measuredCeiling).toBe(false);
    expect(Number.isFinite(m.scenarios[1].pooledDbConns!)).toBe(true);
  });

  it('never forecasts DB or storage below today', () => {
    const big = { ...measured, dbBytes: 100 * GB, storageBytes: 100 * GB };
    const m = buildForecast({ ...input, measured: big });
    for (const s of m.scenarios) {
      expect(s.dbBytes).toBeGreaterThanOrEqual(100 * GB);
      expect(s.storageBytes).toBeGreaterThanOrEqual(100 * GB);
    }
  });

  it('applies the AI cap = max($250 floor, 15% revenue); flags a breach', () => {
    // Force a breach: huge per-DAU AI cost, tiny revenue.
    const a = { ...DEFAULT_ASSUMPTIONS, ai_cost_per_dau_cents: 10_000, paying_conversion_pct: 0 };
    const s = buildForecast({ measured, assumptions: a }).scenarios[1]; // 500K
    expect(s.revenueUsd).toBe(0);
    expect(s.aiUsd).toBe(AI_FLOOR_USD); // cap collapses to the floor, not 0
    expect(s.aiCapBreached).toBe(true);
  });

  it('computes the revenue funnel and a finite margin %', () => {
    const s = buildForecast(input).scenarios[3]; // 1M
    // registered 4M × 20% × 15% × $149 = 120,000 × 149 = 17,880,000
    expect(s.revenueUsd).toBeCloseTo(17_880_000, 0);
    expect(s.marginPct).not.toBeNull();
    expect(s.costPerDauUsd).toBeGreaterThan(0);
  });

  it('adds egress overage only past the included allowance', () => {
    const m = buildForecast(input);
    expect(m.scenarios[3].supabaseUsd).toBeGreaterThan(m.scenarios[1].supabaseUsd);
  });

  it('AI cost = uncapped when demand is under the cap; not flagged', () => {
    const s = buildForecast(input).scenarios[3]; // 1M — huge revenue ⇒ cap ≫ uncapped ($5k)
    expect(s.aiUsd).toBeCloseTo(s.aiUncappedUsd!, 6);
    expect(s.aiCapBreached).toBe(false);
  });

  it('selects a compute tier by peak concurrency, and Custom beyond the top tier', () => {
    // 500K × 0.1% = 500 concurrent ≤ Micro (1 GB × 2000) → smallest tier
    const low = buildForecast({ measured, assumptions: { ...DEFAULT_ASSUMPTIONS, peak_concurrency_pct: 0.1 } });
    expect(low.scenarios[1].computeTier).toBe('Micro');
    // default 8% → 500K × 8% = 40,000 > XL ceiling (16 GB × 2000 = 32,000) → Custom
    expect(buildForecast(input).scenarios[1].computeTier).toMatch(/Custom/);
  });

  it('charges disk overage only past the included 8 GB (flat below, higher above)', () => {
    // both keep total DB under 8 GB ⇒ identical Supabase cost (disk overage 0 for both)
    const a1 = buildForecast({ measured, assumptions: { ...DEFAULT_ASSUMPTIONS, db_kb_per_user: 1 } });
    const a2 = buildForecast({ measured, assumptions: { ...DEFAULT_ASSUMPTIONS, db_kb_per_user: 2 } });
    expect(a1.scenarios[1].supabaseUsd).toBe(a2.scenarios[1].supabaseUsd);
    // 100 KB/user × 2M registered ≫ 8 GB ⇒ positive disk overage
    const big = buildForecast({ measured, assumptions: { ...DEFAULT_ASSUMPTIONS, db_kb_per_user: 100 } });
    expect(big.scenarios[1].supabaseUsd).toBeGreaterThan(a1.scenarios[1].supabaseUsd);
  });
});
