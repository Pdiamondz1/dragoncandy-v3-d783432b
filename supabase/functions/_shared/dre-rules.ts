// Pure award/tier rules for the Dragon Rewards Engine. No `https://` imports so
// Vitest can load this in the frontend test run.

export type TierThreshold = {
  key: string;
  min_dp: number;
  min_campaigns?: number;
  min_avg_rating?: number;
};

export type TierThresholds = {
  creator: TierThreshold[];
  business: TierThreshold[];
};

/** DP for an event = its configured value (×1.0 multiplier applied by the caller in v1). */
export function computeAward(eventType: string, pointValues: Record<string, number>): number {
  return pointValues[eventType] ?? 0;
}

/**
 * Highest tier whose EVERY condition is met (DP and milestone and rating).
 * Thresholds are ascending; the last fully-satisfied entry wins. Points alone
 * never unlock a tier — a milestone shortfall keeps the user at the lower tier.
 */
export function resolveTier(
  role: string,
  metrics: { balance: number; campaignsCompleted: number; avgRating: number | null },
  thresholds: TierThresholds,
): string {
  const list = role === 'content_creator' ? thresholds.creator : thresholds.business;
  let result = 'egg';
  for (const t of list) {
    if (metrics.balance < t.min_dp) continue;
    if (t.min_campaigns != null && metrics.campaignsCompleted < t.min_campaigns) continue;
    if (t.min_avg_rating != null && (metrics.avgRating == null || metrics.avgRating < t.min_avg_rating)) continue;
    result = t.key;
  }
  return result;
}
