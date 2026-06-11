export interface BriefStatusInput {
  is_posted: boolean;
  post_count: number;
  measurable_post_count: number;
}

export type BriefStatus = 'awaiting_post' | 'measuring' | 'unmeasured' | 'has_performance';

/**
 * Lifecycle of a content brief once acted on:
 *  - awaiting_post   — brief generated, no published post yet
 *  - measuring       — published, no engagement snapshot captured yet (24h/72h/7d pending)
 *  - unmeasured      — published AND captured, but Outstand returned no per-account metrics for any
 *                      linked post (post deleted/archived, account disconnected, or analytics not yet
 *                      populated — Outstand makes these indistinguishable). We must NOT imply a
 *                      measured "0 views" here.
 *  - has_performance — at least one linked post has measurable captured engagement
 * Performance data wins over is_posted (most useful state) when it is measurable.
 */
export function deriveBriefStatus({ is_posted, post_count, measurable_post_count }: BriefStatusInput): BriefStatus {
  if (post_count > 0 && measurable_post_count > 0) return 'has_performance';
  if (post_count > 0) return 'unmeasured';
  if (is_posted) return 'measuring';
  return 'awaiting_post';
}
