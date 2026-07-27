import { describe, it, expect } from 'vitest';
import { buildScorecard, growthLast30Days } from './scorecardModel';

const WEIGHT = [
  { captured_at: '2026-06-26T00:00:00Z', db_bytes: 70 * 1024 * 1024, users_total_real: null },
  { captured_at: '2026-07-23T00:00:00Z', db_bytes: 78 * 1024 * 1024, users_total_real: 34 },
  { captured_at: '2026-07-26T00:00:00Z', db_bytes: 78 * 1024 * 1024, users_total_real: 40 },
];
const INPUT = {
  realUsers: 40,
  realCreators: 17,
  realBusinesses: 17,
  realCampaigns: 25,
  realPosts: 10,
  weightSnapshots: WEIGHT,
  diskLimitBytes: 8 * 1024 * 1024 * 1024,
  burn: { monthly_opex_cents: 39000, mtd_ai_spend_usd: 12, mtd_revenue_cents: 0, net_burn_cents: 40200 },
  burnCeilingCents: 40000,
  aiUnderCap: true,
};

function stories() {
  const out: Record<string, ReturnType<typeof buildScorecard>[number]> = {};
  for (const s of buildScorecard(INPUT)) out[s.key] = s;
  return out;
}

describe('growthLast30Days', () => {
  it('uses only non-null users_total_real snapshots', () => {
    expect(growthLast30Days(WEIGHT)).toBe(6); // 40 - 34; the null June snapshot is skipped
  });
  it('returns null when <2 non-null snapshots', () => {
    expect(growthLast30Days([{ captured_at: '2026-07-26T00:00:00Z', db_bytes: 1, users_total_real: 40 }])).toBeNull();
    expect(growthLast30Days([])).toBeNull();
  });
  it('baselines off a prior point, never the latest snapshot itself (sparse >30d history)', () => {
    // both usable snapshots are >30 days apart → must use the prior point (30), never return +0
    expect(growthLast30Days([
      { captured_at: '2026-06-01T00:00:00Z', db_bytes: 1, users_total_real: 30 },
      { captured_at: '2026-07-26T00:00:00Z', db_bytes: 1, users_total_real: 40 },
    ])).toBe(10);
  });
});

describe('buildScorecard', () => {
  const s = stories();
  it('traction: headline + green when not declining', () => {
    expect(s.traction.headline).toContain('40');
    expect(s.traction.detail).toContain('6'); // +6 in ~30 days
    expect(s.traction.signal).toBe('green');
  });
  it('efficiency: amber when net burn over ceiling', () => {
    expect(s.efficiency.headline).toContain('$402'); // 40200 cents
    expect(s.efficiency.signal).toBe('amber'); // 40200 > 40000 ceiling
  });
  it('headroom: ~100x and green under 70%', () => {
    expect(s.headroom.headline).toMatch(/~1\d\d×|~100×/); // 8GB / 78MB ≈ 105 → clamped ~100× (Unicode ×)
    expect(s.headroom.signal).toBe('green');
  });
  it('revenue: always info', () => {
    expect(s.revenue.signal).toBe('info');
    expect(s.revenue.headline.toLowerCase()).toContain('pre-revenue');
  });
});

describe('buildScorecard — degradation', () => {
  it('traction omits detail when no usable history', () => {
    const s = buildScorecard({ ...INPUT, weightSnapshots: [] });
    const traction = s.find((x) => x.key === 'traction')!;
    expect(traction.detail).toBeUndefined();
    expect(traction.signal).toBe('green'); // present users, not declining
  });
  it('efficiency shows an unavailable info state (not a false $0/green) when burn is null', () => {
    const s = buildScorecard({ ...INPUT, burn: null });
    const eff = s.find((x) => x.key === 'efficiency')!;
    expect(eff.signal).toBe('info');
    expect(eff.headline).not.toContain('$');
  });
});
