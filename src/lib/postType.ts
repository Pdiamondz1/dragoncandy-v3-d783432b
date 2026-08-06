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

/**
 * Is this `donny_scheduled_posts` row an AMPLIFICATION post rather than a
 * commissioned campaign deliverable?
 *
 * WHY THIS EXISTS. Amplification rows carry a real `campaign_id` (they amplify
 * a campaign), so every query filtering on `campaign_id` alone returns them
 * alongside the campaign's actual deliverables. That is correct for LISTS —
 * the founder's standing decision is that amplification posts DO appear in the
 * schedule and calendar surfaces — but it is wrong for PROGRESS ARITHMETIC.
 * "X of Y posted" is a claim about campaign deliverable progress, and an
 * amplification is not a commissioned deliverable, so counting it changes what
 * the number means: a 5-post campaign reads "4 of 6" after one amplification.
 * Visibility and progress are different questions; this predicate is only for
 * the second. Never use it to hide rows from a list.
 *
 * Deliberately defined in terms of the ONE established discriminator
 * (`SOURCE_TO_POST_TYPE`, whose `'sponsorship_amplification'` key
 * `buildAmplificationScheduleRows` writes) rather than a second literal
 * comparison — so if another source ever maps to `'amplification'`, every
 * progress readout follows automatically instead of drifting. `campaignId` is
 * passed as `null` on purpose: these rows always have one, and letting the
 * campaign fallback run would resolve an unmapped source to `'campaign'`, which
 * is right for post_type but irrelevant here — this must answer only
 * "is it amplification?", never "is it a campaign post?".
 */
export function isAmplificationPost(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const source = typeof metadata?.source === 'string' ? metadata.source : null;
  return resolvePostType(source, null) === 'amplification';
}
