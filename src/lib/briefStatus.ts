export interface BriefStatusInput {
  is_posted: boolean;
  post_count: number;
}

export type BriefStatus = 'awaiting_post' | 'measuring' | 'has_performance';

/**
 * Lifecycle of a content brief once acted on:
 *  - awaiting_post   — brief generated, no published post yet
 *  - measuring       — published, engagement not captured yet (24h/72h/7d milestones pending)
 *  - has_performance — at least one linked post has captured engagement
 * If performance data exists it always wins (most useful state), regardless of is_posted.
 */
export function deriveBriefStatus({ is_posted, post_count }: BriefStatusInput): BriefStatus {
  if (post_count > 0) return 'has_performance';
  if (is_posted) return 'measuring';
  return 'awaiting_post';
}
