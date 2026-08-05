// Pure mapping of Outstand's account-metrics response onto our four metric
// types. No Deno/Node/Supabase/IO.
//
// Sibling: src/lib/outstandMetricsMap.ts — keep in sync (edge can't import src/).
//
// CAPTURED FROM A LIVE RESPONSE 2026-08-04, not from documentation:
//
//   {
//     account_id: "LEnjV",
//     network: "instagram",
//     followers_count: 4,
//     following_count: 2,
//     posts_count: 12,
//     engagement: { views, likes, comments, shares, saves, reach,
//                   accounts_engaged, total_interactions },
//     platform_specific: { … },
//     period: { … },
//     fetched_at: "…"
//   }
//
// WHY THIS MODULE EXISTS
// ----------------------
// The previous mapping read `followers ?? followerCount`, `engagementRate`,
// `reach ?? impressions`, `postsCount`. NOT ONE of those keys exists in the real
// response: the counts are snake_case, `engagement` is an OBJECT rather than a
// rate, and `reach` is nested inside it. Every read missed and fell through to
// `0`, so the Analytics tab rendered a fully-populated dashboard of zeros for an
// account that actually had 867 views, 630 reach and 12 posts. Nothing errored.
//
// This is the third instance in this project of the same failure: a plausible
// zero standing in for an absent measurement. Hence a single shared mapper,
// derived from an observed payload, with the raw shape recorded above.

export interface OutstandAccountMetrics {
  followers: number;
  /** DERIVED, not reported — see below. */
  engagementRate: number;
  reach: number;
  postsCount: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Returns null when the payload carries none of the fields we recognise — the
 * caller must treat that as a FAILURE, never as zeros. "No data returned" and
 * "measured zero" are different facts and must not collapse into the same row.
 */
export function mapOutstandAccountMetrics(
  raw: unknown,
): OutstandAccountMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const engagement = (r.engagement ?? {}) as Record<string, unknown>;

  // Accept the real snake_case keys first, then the camelCase names the old code
  // assumed, so a future provider change in either direction still maps.
  const followers = num(r.followers_count ?? r.followers ?? r.followerCount);
  const postsCount = num(r.posts_count ?? r.postsCount);
  const reach = num(engagement.reach ?? r.reach ?? r.impressions);

  const hasAnyKnownField =
    r.followers_count !== undefined ||
    r.posts_count !== undefined ||
    r.engagement !== undefined ||
    r.followers !== undefined ||
    r.postsCount !== undefined;
  if (!hasAnyKnownField) return null;

  // Outstand reports no engagement RATE — only absolute counters. Derive the
  // conventional interactions-per-reach ratio, and be explicit that it is ours:
  // if reach is 0 the rate is undefined, and 0 is the honest answer rather than
  // a division artifact.
  const interactions = num(engagement.total_interactions);
  const engagementRate = reach > 0 ? interactions / reach : 0;

  return { followers, engagementRate, reach, postsCount };
}
