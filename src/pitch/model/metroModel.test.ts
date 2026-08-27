import { describe, it, expect } from 'vitest';
import { penetrationAtMonth, customersAtMonth, projectMetroYear } from './metroModel';
import { addressableVenues, MODEL_YEARS } from './metros';
import { REGISTERED_MIX } from './project';

describe('the penetration curve', () => {
  it('is zero before the metro launches', () => {
    // Palm Beach launches month 12.
    expect(penetrationAtMonth('palm-beach', 11)).toBe(0);
    expect(penetrationAtMonth('palm-beach', 1)).toBe(0);
  });

  it('hits the registered penetration exactly at each year end', () => {
    expect(penetrationAtMonth('hoboken', 12)).toBeCloseTo(0.08, 10);
    expect(penetrationAtMonth('hoboken', 24)).toBeCloseTo(0.22, 10);
    expect(penetrationAtMonth('hoboken', 36)).toBeCloseTo(0.35, 10);
  });

  it('rises monotonically across the whole horizon', () => {
    for (const id of ['hoboken', 'manhattan', 'palm-beach']) {
      let prev = -1;
      for (let m = 1; m <= 36; m += 1) {
        const p = penetrationAtMonth(id, m);
        expect(p, `${id} month ${m}`).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
  });

  it('interpolates between year ends rather than stepping', () => {
    const mid = penetrationAtMonth('hoboken', 18);
    expect(mid).toBeGreaterThan(0.08);
    expect(mid).toBeLessThan(0.22);
  });
});

describe('customers', () => {
  it('never exceeds the addressable venue count', () => {
    for (let m = 1; m <= 36; m += 1) {
      expect(customersAtMonth('hoboken', m)).toBeLessThanOrEqual(addressableVenues('hoboken'));
    }
  });
});

describe('projectMetroYear', () => {
  const mix = REGISTERED_MIX;

  it('produces no revenue for a metro that has not launched', () => {
    const y = projectMetroYear('palm-beach', 2026, mix);
    expect(y.revenue).toBe(0);
    expect(y.customersAtYearEnd).toBe(0);
  });

  it('grows revenue year over year for a launched metro', () => {
    const r = MODEL_YEARS.map((y) => projectMetroYear('hoboken', y, mix).revenue);
    expect(r[1]).toBeGreaterThan(r[0]);
    expect(r[2]).toBeGreaterThan(r[1]);
  });

  it('splits revenue into subscription and take rate that sum to the total', () => {
    const y = projectMetroYear('hoboken', 2027, mix);
    expect(y.subscriptionRevenue + y.takeRateRevenue).toBeCloseTo(y.revenue, 6);
  });

  it('charges marketing on gross adds, so a year with churn costs more than net growth', () => {
    const y = projectMetroYear('hoboken', 2027, mix);
    const netAdds = y.customersAtYearEnd - y.customersAtYearStart;
    expect(y.grossAdds).toBeGreaterThan(netAdds);
    expect(y.marketingCost).toBeGreaterThan(0);
  });

  // The three Adrian blocks with no analogue. A future edit that quietly adds a
  // "bonus cost" or "gaming tax" row would be inventing a number to match his shape.
  it('has no bonus, gaming-tax or market-access line', () => {
    const y = projectMetroYear('hoboken', 2027, mix) as unknown as Record<string, unknown>;
    for (const forbidden of ['bonusCost', 'gamingTax', 'marketAccessFee']) {
      expect(Object.keys(y)).not.toContain(forbidden);
    }
  });

  it('reports metro EBITDA as gross profit less marketing', () => {
    const y = projectMetroYear('hoboken', 2028, mix);
    expect(y.metroEbitda).toBeCloseTo(y.grossProfit - y.marketingCost, 6);
  });
});
