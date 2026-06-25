import type { AccountAnalytics } from '@/integrations/social/contract';

/**
 * A single `social_analytics_cache` insert/upsert row.
 *
 * Reproduces the contract used by the legacy Outstand `useAccountMetrics` hook:
 * the column is `outstand_account_id` (provider-agnostic despite the name), and
 * `metric_type` is one of `followers | engagement | reach | posts` — NOT
 * `engagement_rate`. The upsert key is
 * `user_id,outstand_account_id,metric_type,period_start,period_end`.
 */
export type SocialMetricType = 'followers' | 'engagement' | 'reach' | 'posts';

export interface SocialAnalyticsCacheRow {
  user_id: string;
  outstand_account_id: string;
  platform: string;
  metric_type: SocialMetricType;
  metric_value: number;
  period_start: string;
  period_end: string;
  fetched_at: string;
}

/**
 * Map a contract `AccountAnalytics` payload into the four
 * `social_analytics_cache` rows (one per metric) for an account + period.
 *
 * Field mapping: `followers` → `followers`, `engagementRate` → `engagement`,
 * `reach` → `reach`, `postsCount` → `posts`.
 */
export function accountAnalyticsToCacheRows(
  userId: string,
  account: { id: string; platform: string },
  analytics: AccountAnalytics,
  period: { start: string; end: string },
): SocialAnalyticsCacheRow[] {
  const base = {
    user_id: userId,
    outstand_account_id: account.id,
    platform: account.platform,
    period_start: period.start,
    period_end: period.end,
    fetched_at: new Date().toISOString(),
  };

  const metrics: Array<{ metric_type: SocialMetricType; metric_value: number }> = [
    { metric_type: 'followers', metric_value: analytics.followers },
    { metric_type: 'engagement', metric_value: analytics.engagementRate },
    { metric_type: 'reach', metric_value: analytics.reach },
    { metric_type: 'posts', metric_value: analytics.postsCount },
  ];

  return metrics.map((m) => ({ ...base, ...m }));
}
