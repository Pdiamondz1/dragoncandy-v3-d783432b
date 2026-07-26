/**
 * Plain-language stakeholder scorecard model — pure, deterministic (NO LLM). Turns reused real-only
 * stats into four stories a non-technical stakeholder can read and speak to. See the design spec.
 */
export type Signal = 'green' | 'amber' | 'info';

export interface ScorecardStory {
  key: 'traction' | 'efficiency' | 'headroom' | 'revenue';
  title: string;
  headline: string;
  meaning: string;
  signal: Signal;
  detail?: string;
}

export interface WeightPoint {
  captured_at: string;
  db_bytes: number;
  users_total_real?: number | null;
}

export interface ScorecardInput {
  realUsers: number;
  realCreators: number;
  realBusinesses: number;
  realCampaigns: number;
  realPosts: number;
  weightSnapshots: WeightPoint[];
  diskLimitBytes: number;
  burn: { monthly_opex_cents: number; mtd_ai_spend_usd: number; mtd_revenue_cents: number; net_burn_cents: number };
  burnCeilingCents: number;
  aiUnderCap: boolean;
}

const DAY = 86_400_000;

/** Real-user delta over ~30 days from platform_weight, skipping NULL users_total_real snapshots
 *  (NULL on pre-2026-07-23 rows — coercing to 0 would render a false spike). null if <2 usable pts. */
export function growthLast30Days(snapshots: WeightPoint[]): number | null {
  const pts = snapshots
    .filter((s) => typeof s.users_total_real === 'number')
    .map((s) => ({ t: new Date(s.captured_at).getTime(), n: s.users_total_real as number }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const windowStart = last.t - 30 * DAY;
  const base = pts.find((p) => p.t >= windowStart) ?? pts[0];
  return last.n - base.n;
}

const fmtUsd0 = (usd: number) => `$${Math.round(usd).toLocaleString()}`;
/** Friendly headroom multiple: round to a round-ish figure so "~105x" reads as "~100x". */
function clampFriendly(mult: number): number {
  if (mult >= 100) return Math.round(mult / 50) * 50;   // 105 → ~100, 140 → ~150
  if (mult >= 10) return Math.round(mult / 10) * 10;
  return Math.max(1, Math.floor(mult));
}

export function buildScorecard(i: ScorecardInput): ScorecardStory[] {
  // Traction
  const delta = growthLast30Days(i.weightSnapshots);
  const traction: ScorecardStory = {
    key: 'traction',
    title: 'Traction',
    headline: `${i.realUsers.toLocaleString()} real people are building on DragonCandy`,
    meaning: `Real creators and businesses — not test data — using the marketplace end to end (${i.realCreators} creators, ${i.realBusinesses} businesses, ${i.realCampaigns} campaigns, ${i.realPosts} posts shared).`,
    signal: delta !== null && delta < 0 ? 'amber' : 'green',
    detail: delta !== null ? `${delta >= 0 ? '+' : ''}${delta} in the last 30 days` : undefined,
  };

  // Capital efficiency
  const burnUsd = i.burn.net_burn_cents / 100;
  const efficiency: ScorecardStory = {
    key: 'efficiency',
    title: 'Capital efficiency',
    headline: `We run the whole platform for ~${fmtUsd0(burnUsd)}/month`,
    meaning: 'Total cost to operate — infrastructure, AI, and tools — minus any revenue. Lean by design.',
    signal: i.burn.net_burn_cents <= i.burnCeilingCents && i.aiUnderCap ? 'green' : 'amber',
    detail: i.aiUnderCap ? undefined : 'AI spend approaching the 15%-of-revenue cap',
  };

  // Scale headroom — physical infra capacity (synthetic-inclusive db_bytes; conservative). See spec §4.
  const latest = [...i.weightSnapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  ).pop();
  const dbBytes = latest?.db_bytes ?? 0;
  const mult = dbBytes > 0 ? clampFriendly(i.diskLimitBytes / dbBytes) : null;
  const ratio = dbBytes / i.diskLimitBytes;
  const headroom: ScorecardStory = {
    key: 'headroom',
    title: 'Scale headroom',
    headline: mult ? `Room to grow ~${mult.toLocaleString()}× before infrastructure costs rise` : 'Ample infrastructure headroom',
    meaning: 'Current infrastructure usage (physical, incl. test data — so this is conservative) is a tiny fraction of the plan. We scale cheaply for a long time.',
    signal: ratio < 0.7 ? 'green' : 'amber',
  };

  // Revenue readiness — framing, always info.
  const revenue: ScorecardStory = {
    key: 'revenue',
    title: 'Revenue readiness',
    headline: 'Pre-revenue by design — the money switch is built, not flipped',
    meaning: 'Payment rails are live in test mode: Stripe Connect, the Free 10% → … → 2% take-rate ladder, and DragonShare 80/20 boosts. Turning on paid campaigns is a switch, not a build.',
    signal: 'info',
  };

  return [traction, efficiency, headroom, revenue];
}
