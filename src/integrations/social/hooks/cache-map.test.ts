import { describe, it, expect } from 'vitest';
import { accountAnalyticsToCacheRows } from './cache-map';
import type { AccountAnalytics } from '@/integrations/social/contract';

describe('accountAnalyticsToCacheRows', () => {
  const userId = 'user-123';
  const account = { id: 'acc-1', platform: 'instagram' };
  const analytics: AccountAnalytics = {
    followers: 1500,
    engagementRate: 4.2,
    reach: 9000,
    postsCount: 37,
  };
  const period = { start: '2026-06-01T00:00:00.000Z', end: '2026-06-08T00:00:00.000Z' };

  it('produces exactly 4 rows, one per metric', () => {
    const rows = accountAnalyticsToCacheRows(userId, account, analytics, period);
    expect(rows).toHaveLength(4);
  });

  it('uses the followers | engagement | reach | posts metric_type names (engagement, NOT engagement_rate)', () => {
    const rows = accountAnalyticsToCacheRows(userId, account, analytics, period);
    const types = rows.map((r) => r.metric_type).sort();
    expect(types).toEqual(['engagement', 'followers', 'posts', 'reach']);
    expect(types).not.toContain('engagement_rate');
  });

  it('maps each AccountAnalytics field to the correct metric_value', () => {
    const rows = accountAnalyticsToCacheRows(userId, account, analytics, period);
    const byType = Object.fromEntries(rows.map((r) => [r.metric_type, r.metric_value]));
    expect(byType.followers).toBe(1500);
    expect(byType.engagement).toBe(4.2); // engagementRate -> engagement
    expect(byType.reach).toBe(9000);
    expect(byType.posts).toBe(37); // postsCount -> posts
  });

  it('stamps the shared columns and upsert-key fields on every row', () => {
    const rows = accountAnalyticsToCacheRows(userId, account, analytics, period);
    for (const row of rows) {
      expect(row.user_id).toBe(userId);
      expect(row.outstand_account_id).toBe('acc-1');
      expect(row.platform).toBe('instagram');
      expect(row.period_start).toBe(period.start);
      expect(row.period_end).toBe(period.end);
      expect(typeof row.fetched_at).toBe('string');
      expect(Number.isNaN(Date.parse(row.fetched_at))).toBe(false);
    }
  });
});
