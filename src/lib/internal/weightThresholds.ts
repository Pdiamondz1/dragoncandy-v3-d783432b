/**
 * Scaling-threshold rules for the AIOS weight page.
 * Tier facts from the founder's Supabase Compute & Disk screenshot (2026-06-11)
 * — see the AIOS design spec §C. Update COMPUTE_TIERS / DISK_LIMIT_BYTES when
 * the plan changes; everything else derives from them.
 */

export const GB = 1024 * 1024 * 1024;

/** Spend cap limits disk to 8 GB on the current plan. */
export const DISK_LIMIT_BYTES = 8 * GB;

export const COMPUTE_TIERS = [
  { name: 'Micro', ramGb: 1, monthlyUsd: 10 },
  { name: 'Small', ramGb: 2, monthlyUsd: 15 },
  { name: 'Medium', ramGb: 4, monthlyUsd: 60 },
  { name: 'Large', ramGb: 8, monthlyUsd: 110 },
  { name: 'XL', ramGb: 16, monthlyUsd: 210 },
] as const;

/** Index into COMPUTE_TIERS — the one-line update when the plan changes. */
const CURRENT_TIER_INDEX = 0;
export const CURRENT_TIER = COMPUTE_TIERS[CURRENT_TIER_INDEX];

const DISK_WARNING_RATIO = 0.7;
const DISK_CRITICAL_RATIO = 0.85;
const FORECAST_HORIZON_DAYS = 90;

/**
 * Soft cap the retention cron enforces on analytics_events
 * (purge_stale_analytics_events.v_budget). Keep these two in sync — raise both
 * only when deliberately upgrading the Supabase tier.
 */
export const ANALYTICS_EVENTS_ROW_BUDGET = 1_000_000;
const ANALYTICS_WARNING_RATIO = 0.8;
const ANALYTICS_CRITICAL_RATIO = 0.95;

export interface WeightSnapshot {
  captured_at: string;
  db_bytes: number;
  storage_bytes: number;
  users_total: number;
}

export interface WeightAlert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
}

/** Linear growth rate (bytes/day) between the first and last snapshot. */
export function dailyGrowthBytes(snapshots: WeightSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (new Date(last.captured_at).getTime() - new Date(first.captured_at).getTime()) / 86_400_000;
  if (days <= 0) return 0;
  return (last.db_bytes - first.db_bytes) / days;
}

/**
 * Whole days until DB size crosses the disk warning threshold at the given
 * growth rate. 0 if already past; null if not growing.
 */
export function daysUntilDiskAlert(currentDbBytes: number, growthPerDay: number): number | null {
  const threshold = DISK_LIMIT_BYTES * DISK_WARNING_RATIO;
  if (currentDbBytes >= threshold) return 0;
  if (growthPerDay <= 0) return null;
  // FP-tolerant ceil: an exact N-day crossing can land at N + ~1e-15 in floats.
  return Math.ceil((threshold - currentDbBytes) / growthPerDay - 1e-9);
}

export function computeWeightAlerts(snapshots: WeightSnapshot[]): WeightAlert[] {
  if (snapshots.length === 0) return [];
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const alerts: WeightAlert[] = [];
  const ratio = latest.db_bytes / DISK_LIMIT_BYTES;
  const nextTier = COMPUTE_TIERS[CURRENT_TIER_INDEX + 1] as
    | (typeof COMPUTE_TIERS)[number]
    | undefined;
  const upgradeHint = nextTier
    ? `Next tier: ${nextTier.name} (${nextTier.ramGb} GB RAM, $${nextTier.monthlyUsd}/mo) — or raise the spend cap for more disk.`
    : 'Already on the top listed tier — raise the spend cap or contact Supabase for custom compute.';

  if (ratio >= DISK_CRITICAL_RATIO) {
    alerts.push({
      severity: 'critical',
      title: 'Time to scale disk',
      detail: `Database is at ${Math.round(ratio * 100)}% of the ${DISK_LIMIT_BYTES / GB} GB spend-cap disk limit. ${upgradeHint}`,
    });
  } else if (ratio >= DISK_WARNING_RATIO) {
    alerts.push({
      severity: 'warning',
      title: 'Disk usage climbing',
      detail: `Database is at ${Math.round(ratio * 100)}% of the ${DISK_LIMIT_BYTES / GB} GB spend-cap disk limit. ${upgradeHint}`,
    });
  } else {
    const growth = dailyGrowthBytes(sorted);
    const days = daysUntilDiskAlert(latest.db_bytes, growth);
    if (days !== null && days > 0 && days <= FORECAST_HORIZON_DAYS) {
      alerts.push({
        severity: 'info',
        title: 'Disk threshold ahead',
        detail: `At the current growth rate the database crosses ${Math.round(DISK_WARNING_RATIO * 100)}% of the disk limit in about ${days} days. ${upgradeHint}`,
      });
    }
  }

  return alerts;
}

/**
 * Watermark alert for the analytics_events row budget. The daily retention cron
 * trims the table back to ANALYTICS_EVENTS_ROW_BUDGET, so crossing the warning
 * line means the *effective* retention window is shrinking below 90 days — the
 * signal to raise the cap or move to a larger Supabase tier.
 */
export function computeAnalyticsBudgetAlert(rowCount: number | undefined): WeightAlert[] {
  if (rowCount === undefined || rowCount <= 0) return [];
  const ratio = rowCount / ANALYTICS_EVENTS_ROW_BUDGET;
  const pct = Math.round(ratio * 100);
  const hint =
    'The daily retention job is holding the table at this cap, so older events ' +
    'are being trimmed sooner. Raise ANALYTICS_EVENTS_ROW_BUDGET (and the cron ' +
    'v_budget) or move to a larger Supabase tier.';

  if (ratio >= ANALYTICS_CRITICAL_RATIO) {
    return [{
      severity: 'critical',
      title: 'Analytics table at budget',
      detail: `analytics_events is at ${pct}% of its ${ANALYTICS_EVENTS_ROW_BUDGET.toLocaleString()}-row budget. ${hint}`,
    }];
  }
  if (ratio >= ANALYTICS_WARNING_RATIO) {
    return [{
      severity: 'warning',
      title: 'Analytics table nearing budget',
      detail: `analytics_events is at ${pct}% of its ${ANALYTICS_EVENTS_ROW_BUDGET.toLocaleString()}-row budget. ${hint}`,
    }];
  }
  return [];
}
