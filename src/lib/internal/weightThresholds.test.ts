import { describe, it, expect } from 'vitest';
import {
  GB,
  COMPUTE_TIERS,
  dailyGrowthBytes,
  daysUntilDiskAlert,
  computeWeightAlerts,
  computeAnalyticsBudgetAlert,
  computeConnectionAlert,
  connectionHeadroomPct,
  ANALYTICS_EVENTS_ROW_BUDGET,
  type WeightSnapshot,
} from './weightThresholds';

const day = 24 * 60 * 60 * 1000;
// Fixed epoch — two Date.now() calls can differ by a millisecond, which
// shifts the growth rate just enough to flip exact-day forecast boundaries.
const T0 = Date.parse('2026-06-11T00:00:00Z');
const snap = (daysAgo: number, dbBytes: number): WeightSnapshot => ({
  captured_at: new Date(T0 - daysAgo * day).toISOString(),
  db_bytes: dbBytes,
  storage_bytes: 0,
  users_total: 40,
});

describe('dailyGrowthBytes', () => {
  it('computes linear growth from first to last snapshot', () => {
    const snapshots = [snap(10, 1 * GB), snap(0, 2 * GB)];
    expect(dailyGrowthBytes(snapshots)).toBeCloseTo(0.1 * GB, -6);
  });

  it('returns 0 with fewer than two snapshots', () => {
    expect(dailyGrowthBytes([snap(0, GB)])).toBe(0);
    expect(dailyGrowthBytes([])).toBe(0);
  });

  it('returns 0 when snapshots are at the same instant', () => {
    const s = snap(0, GB);
    expect(dailyGrowthBytes([s, { ...s, db_bytes: 2 * GB }])).toBe(0);
  });
});

describe('daysUntilDiskAlert', () => {
  it('projects days until the 70% disk threshold at current growth', () => {
    // at 4 GB of 8 GB limit, alert threshold = 5.6 GB; growing 0.1 GB/day → 16 days
    expect(daysUntilDiskAlert(4 * GB, 0.1 * GB)).toBe(16);
  });

  it('returns 0 when already past the threshold', () => {
    expect(daysUntilDiskAlert(6 * GB, 0.1 * GB)).toBe(0);
  });

  it('returns null when there is no growth', () => {
    expect(daysUntilDiskAlert(4 * GB, 0)).toBeNull();
    expect(daysUntilDiskAlert(4 * GB, -5)).toBeNull();
  });
});

describe('computeWeightAlerts', () => {
  it('raises a critical alert above 85% of the disk limit', () => {
    const alerts = computeWeightAlerts([snap(1, 7 * GB), snap(0, 7 * GB)]);
    expect(alerts.some((a) => a.severity === 'critical' && a.title.includes('disk'))).toBe(true);
  });

  it('raises a warning between 70% and 85%', () => {
    const alerts = computeWeightAlerts([snap(1, 6 * GB), snap(0, 6 * GB)]);
    expect(alerts.some((a) => a.severity === 'warning')).toBe(true);
    expect(alerts.some((a) => a.severity === 'critical')).toBe(false);
  });

  it('names the next compute tier in the alert detail', () => {
    const alerts = computeWeightAlerts([snap(1, 7 * GB), snap(0, 7 * GB)]);
    const disk = alerts.find((a) => a.severity === 'critical');
    expect(disk?.detail).toMatch(/Small/);
  });

  it('stays quiet at healthy usage with no growth', () => {
    expect(computeWeightAlerts([snap(1, 1 * GB), snap(0, 1 * GB)])).toHaveLength(0);
  });

  it('forecasts an upcoming crossing when growth is sustained', () => {
    // 4 GB now, ~0.1 GB/day → crosses 5.6 GB in ~16 days → forecast alert
    const alerts = computeWeightAlerts([snap(10, 3 * GB), snap(0, 4 * GB)]);
    expect(alerts.some((a) => a.severity === 'info' && /16 days/.test(a.detail))).toBe(true);
  });

  it('does not forecast when the crossing is far away', () => {
    // tiny growth: crossing > 90 days out → no noise
    const alerts = computeWeightAlerts([snap(10, 1 * GB), snap(0, 1.001 * GB)]);
    expect(alerts).toHaveLength(0);
  });
});

describe('computeWeightAlerts currentTierIndex', () => {
  it('names the next tier based on the passed current index', () => {
    const atMicro = computeWeightAlerts([snap(0, 7 * GB)], 0); // Micro → next is Small
    expect(atMicro[0].detail).toContain(COMPUTE_TIERS[1].name);
  });

  it('reports no next tier when at the top index', () => {
    const atTop = computeWeightAlerts([snap(0, 7 * GB)], COMPUTE_TIERS.length - 1);
    expect(atTop[0].detail).toMatch(/top listed tier/);
  });

  it('defaults to index 0 when omitted (backwards compatible)', () => {
    expect(computeWeightAlerts([snap(0, 7 * GB)])[0].detail).toContain(COMPUTE_TIERS[1].name);
  });
});

describe('computeAnalyticsBudgetAlert', () => {
  it('stays quiet well under the budget', () => {
    expect(computeAnalyticsBudgetAlert(100_000)).toHaveLength(0);
  });

  it('stays quiet for an undefined row count', () => {
    expect(computeAnalyticsBudgetAlert(undefined)).toHaveLength(0);
  });

  it('warns at 80% of the budget', () => {
    const alerts = computeAnalyticsBudgetAlert(Math.round(ANALYTICS_EVENTS_ROW_BUDGET * 0.81));
    expect(alerts.some((a) => a.severity === 'warning')).toBe(true);
    expect(alerts.some((a) => a.severity === 'critical')).toBe(false);
  });

  it('goes critical at 95% of the budget', () => {
    const alerts = computeAnalyticsBudgetAlert(Math.round(ANALYTICS_EVENTS_ROW_BUDGET * 0.96));
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
  });

  it('uses a title distinct from the disk alerts (no React key collision)', () => {
    const alerts = computeAnalyticsBudgetAlert(ANALYTICS_EVENTS_ROW_BUDGET);
    expect(alerts[0].title.toLowerCase()).not.toContain('disk');
    expect(alerts[0].title).toMatch(/analytics/i);
  });
});

describe('computeConnectionAlert', () => {
  const conns = (total: number) => ({ total, max: 100, reserved: 3 }); // usable = 97
  it('no alert below 70% of usable', () => {
    expect(computeConnectionAlert(conns(67))).toEqual([]); // 67/97 ≈ 69%
  });
  it('warning in [70%, 85%)', () => {
    const a = computeConnectionAlert(conns(75)); // 75/97 ≈ 77%
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('warning');
    expect(a[0].detail).toMatch(/pooler/i); // the honest caveat is present
  });
  it('critical at ≥85%', () => {
    const a = computeConnectionAlert(conns(90)); // 90/97 ≈ 93%
    expect(a[0].severity).toBe('critical');
  });
  it('no alert / no throw when connections null or usable ≤ 0', () => {
    expect(computeConnectionAlert(null)).toEqual([]);
    expect(computeConnectionAlert({ total: 5, max: 3, reserved: 3 })).toEqual([]); // usable 0
  });
});

describe('connectionHeadroomPct', () => {
  it('is the inverse of usage, floored at 0', () => {
    expect(connectionHeadroomPct({ total: 0, max: 100, reserved: 3 })).toBe(100);
    expect(connectionHeadroomPct({ total: 97, max: 100, reserved: 3 })).toBe(0);
    expect(connectionHeadroomPct(null)).toBeNull();
    expect(connectionHeadroomPct({ total: 5, max: 3, reserved: 3 })).toBeNull(); // usable 0
  });
});
