// Sibling: supabase/functions/_shared/dre-rules.ts — keep in sync (src/ never
// imports across the edge boundary; tsconfig.app.json is include: ["src"]).
// computeTierGap must mirror that file's resolveTier semantics exactly.

export interface TierThreshold {
  key: string;
  min_dp: number;
  min_campaigns?: number;
  min_avg_rating?: number;
}

export interface TierThresholds {
  creator: TierThreshold[];
  business: TierThreshold[];
}

export interface StandingMetrics {
  balance: number;
  campaignsCompleted: number;
  avgRating: number | null;
  tier: string;
}

export interface TierGap {
  nextTierKey: string | null;
  pointsShort: number;
  campaignsShort: number;
  ratingRequired: number | null;
  hasNoRatings: boolean;
  met: boolean;
}

/**
 * What the caller still needs for the NEXT tier. Mirrors _shared/dre-rules.ts
 * resolveTier, including its rule that a null avgRating FAILS a min_avg_rating
 * condition — points alone never unlock a tier.
 *
 * Trust boundary: standing.tier is taken as authoritative (the same cached
 * dragon_point_balances.tier the public profile badge renders). It can lag the
 * metrics because tier recompute only runs when a user earns new points — a
 * review that lowers avgRating but earns no points leaves the cached tier
 * stale. This is deliberate: the gap card and the badge show the same cached
 * value, so they never contradict each other on the user's screen.
 */
export function computeTierGap(
  role: string,
  standing: StandingMetrics,
  thresholds: TierThresholds,
): TierGap {
  const list = role === 'content_creator' ? thresholds.creator : thresholds.business;
  const currentIndex = list.findIndex((t) => t.key === standing.tier);
  const next = list[(currentIndex < 0 ? 0 : currentIndex) + 1];

  if (!next) {
    return {
      nextTierKey: null, pointsShort: 0, campaignsShort: 0,
      ratingRequired: null, hasNoRatings: false, met: true,
    };
  }

  const pointsShort = Math.max(0, next.min_dp - standing.balance);
  const campaignsShort = next.min_campaigns != null
    ? Math.max(0, next.min_campaigns - standing.campaignsCompleted)
    : 0;
  const ratingUnmet = next.min_avg_rating != null
    && (standing.avgRating == null || standing.avgRating < next.min_avg_rating);

  return {
    nextTierKey: next.key,
    pointsShort,
    campaignsShort,
    ratingRequired: ratingUnmet ? next.min_avg_rating! : null,
    hasNoRatings: ratingUnmet && standing.avgRating == null,
    met: pointsShort === 0 && campaignsShort === 0 && !ratingUnmet,
  };
}
