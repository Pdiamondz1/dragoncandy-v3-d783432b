// Sibling: supabase/functions/_shared/post-type.ts — keep in sync (edge can't import from src/).
// They MUST agree on post_type resolution because two insert paths compete on the same
// (outstand_post_id, platform) key: DonnyProvider (here) and a webhook. If they disagree
// on an unmapped source + a campaign present, one writes 'standalone' and the other writes
// 'campaign' — whichever lands second silently overwrites the first in the column the
// content-strategy-recommend engine groups by, poisoning every recommendation.

/**
 * The exact vocabulary of the live `social_post_log.post_type` CHECK, verified
 * against prod 2026-08-05. The column is NOT NULL, so an out-of-vocabulary value
 * fails the insert — and on the publish path a failed insert means the post is
 * live but unrecorded.
 */
export const POST_TYPES = [
  'amplification', 'cross_post', 'standalone', 'campaign', 'ugc_promotion', 'dragonshare',
] as const;

export type PostType = (typeof POST_TYPES)[number];

/** Lifted from src/contexts/DonnyProvider.tsx:215-220 — previously the only copy. */
const SOURCE_TO_POST_TYPE = new Map<string, PostType>([
  ['campaign_social_hook', 'campaign'],
  ['promotion_social_hook', 'ugc_promotion'],
  ['dragonshare_social_hook', 'dragonshare'],
  // useSponsorshipAmplification.ts's buildAmplificationScheduleRows sets this
  // source on its donny_scheduled_posts rows. Without a mapping, an
  // amplification post (which always carries a campaign_id) fell through to
  // the campaignId fallback below and resolved to 'campaign' — silently
  // overwriting the client's own correct 'amplification' literal when the
  // webhook's upsert lands on the same (outstand_post_id, platform) row.
  ['sponsorship_amplification', 'amplification'],
]);

/**
 * Derive post_type from a scheduled post's `metadata.source`, falling back to the
 * presence of a campaign, then to 'standalone'. Deriving rather than defaulting
 * to a constant matters: content-strategy-recommend groups by this column, so a
 * wrong value silently skews every content recommendation.
 */
export function resolvePostType(
  source: string | null | undefined,
  campaignId: string | null | undefined,
): PostType {
  const mapped = source ? SOURCE_TO_POST_TYPE.get(source) : undefined;
  if (mapped) return mapped;
  return campaignId ? 'campaign' : 'standalone';
}
