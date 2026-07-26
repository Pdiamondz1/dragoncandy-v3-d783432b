/**
 * The /internal platform-metric card set, as a pure model rendered by BOTH the
 * Overview (real users) and the Simulation page (synthetic cohort). Synthetic values
 * are `total_all − total` — the same counting method as real, so the two pages
 * reconcile by construction. Keeping this pure (no React) lets us lock the real-mode
 * output to the current Overview with unit tests before refactoring the page.
 */
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

export type MetricMode = 'real' | 'synthetic';

export interface CardModel {
  label: string;
  value: number;
  sub?: string;
}

export interface MetricSection {
  heading: string;
  cards: CardModel[];
}

/** Positive per-key difference all[k] − real[k] (clamped at 0), over the union of keys. */
export function diffBuckets(
  all: Record<string, number> | undefined,
  real: Record<string, number> | undefined,
): Record<string, number> {
  const a = all ?? {};
  const r = real ?? {};
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(r)])) {
    const d = (a[k] ?? 0) - (r[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

/** Synthetic scalar = all − real, clamped; degrades to 0 when `all` is absent. */
function synthValue(real: number, all: number | undefined): number {
  return Math.max(0, (all ?? real) - real);
}

/** Real-mode "of N incl. synthetic" sub — only when synthetic data exists (all > real). */
function ofTotal(real: number, all: number | undefined): string | undefined {
  return all !== undefined && all > real ? `of ${all.toLocaleString()} incl. synthetic` : undefined;
}

/** Join non-empty sub parts with ' · ' (Overview's withSub). */
function withSub(...parts: (string | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** "platform N · platform M" from a counts map, or undefined if empty. */
function platformSub(map: Record<string, number>): string | undefined {
  return (
    Object.entries(map)
      .map(([platform, n]) => `${platform} ${n}`)
      .join(' · ') || undefined
  );
}

/** Synthetic total-users count — drives the "no synthetic cohort" empty state. */
export function syntheticTotalUsers(stats: PlatformStats): number {
  return synthValue(stats.users.total, stats.users.total_all);
}

export function deriveCardModel(stats: PlatformStats, mode: MetricMode): MetricSection[] {
  const real = mode === 'real';
  const { users: u, businesses: b, campaigns: c, dragonshare: d, promotions: pr, content: ct, social_connections: sc } = stats;

  const creatorsReal = u.by_role['content_creator'] ?? 0;
  const creatorsAll = u.by_role_all['content_creator'] ?? 0;
  const activeReal = c.by_status['active'] ?? 0;
  const verifiedReal = d.posts_by_status['verified'] ?? 0;

  const synthStatus = diffBuckets(c.by_status_all, c.by_status);
  const synthPosts = diffBuckets(d.posts_by_status_all, d.posts_by_status);
  const synthPlatform = diffBuckets(sc.by_platform_all, sc.by_platform);

  return [
    {
      heading: 'Users & businesses',
      cards: [
        {
          label: 'Total users',
          value: real ? u.total : synthValue(u.total, u.total_all),
          sub: real ? ofTotal(u.total, u.total_all) : undefined,
        },
        {
          label: 'Creators',
          value: real ? creatorsReal : Math.max(0, creatorsAll - creatorsReal),
          sub: real ? ofTotal(creatorsReal, creatorsAll) : undefined,
        },
        {
          label: 'Restaurants',
          value: real ? b.restaurants : synthValue(b.restaurants, b.restaurants_all),
          sub: real
            ? withSub(`${b.locations} locations`, ofTotal(b.restaurants, b.restaurants_all))
            : `${synthValue(b.locations, b.locations_all)} locations`,
        },
        {
          label: 'Brands',
          value: real ? b.brands : synthValue(b.brands, b.brands_all),
          sub: real ? ofTotal(b.brands, b.brands_all) : undefined,
        },
      ],
    },
    {
      heading: 'Activity',
      cards: [
        {
          label: 'Campaigns',
          value: real ? c.total : synthValue(c.total, c.total_all),
          sub: real
            ? withSub(`${activeReal} active`, ofTotal(c.total, c.total_all))
            : `${synthStatus['active'] ?? 0} active`,
        },
        {
          label: 'DragonShare posts',
          value: real ? d.posts_total : synthValue(d.posts_total, d.posts_total_all),
          sub: real
            ? withSub(
                `${verifiedReal} verified · ${d.boosts_total} boosts`,
                ofTotal(d.posts_total, d.posts_total_all),
              )
            : `${synthPosts['verified'] ?? 0} verified · ${synthValue(d.boosts_total, d.boosts_total_all)} boosts`,
        },
        {
          label: 'Promotions',
          value: real ? pr.total : synthValue(pr.total, pr.total_all),
          sub: real ? ofTotal(pr.total, pr.total_all) : undefined,
        },
        {
          label: 'Social connections',
          value: real ? sc.total : synthValue(sc.total, sc.total_all),
          sub: real
            ? withSub(platformSub(sc.by_platform), ofTotal(sc.total, sc.total_all))
            : platformSub(synthPlatform),
        },
      ],
    },
    {
      heading: 'Content',
      cards: [
        {
          label: 'Social posts logged',
          value: real ? ct.social_posts_logged : synthValue(ct.social_posts_logged, ct.social_posts_logged_all),
          sub: real ? ofTotal(ct.social_posts_logged, ct.social_posts_logged_all) : undefined,
        },
        {
          label: 'Performance-tracked posts',
          value: real ? ct.performance_tracked_posts : synthValue(ct.performance_tracked_posts, ct.performance_tracked_posts_all),
          sub: real ? ofTotal(ct.performance_tracked_posts, ct.performance_tracked_posts_all) : undefined,
        },
      ],
    },
  ];
}
