// _shared/social-post-log-row.ts — the ONE place a social_post_log row is
// built from a matched donny_scheduled_posts row.
//
// Used by BOTH outstand-webhook's recordPublishedPost (the live,
// webhook-delivered path — deployed on prod) and reconcile-social-posts (the
// cron sweep that re-drives the same match when delivery order loses the
// race). A single source of truth for what belongs at a given
// (outstand_post_id, platform) key was extracted here specifically because
// this codebase has already been bitten once by two writers disagreeing
// about it: the webhook's own upsert reclassified 'amplification' rows to
// 'campaign' because resolvePostType had no mapping for that source (fixed
// separately). Two independent hand-written copies of THIS function would
// be the same defect class waiting to happen again.
//
// Pure — no Deno/Supabase/IO — so both social-post-log-row.test.ts and any
// caller can exercise it directly.

import { resolvePostType, type PostType } from './post-type.ts';

/** The donny_scheduled_posts fields a social_post_log row is built from. */
export interface ScheduledPostForLogRow {
  user_id: string;
  campaign_id: string | null;
  caption: string | null;
  hashtags: string[] | null;
  content_type: string | null;
  scheduled_at: string | null;
  metadata: Record<string, unknown> | null;
}

/** The exact social_post_log row shape both callers write. */
export interface SocialPostLogRow {
  user_id: string;
  campaign_id: string | null;
  outstand_post_id: string;
  platform: string;
  post_type: PostType;
  caption: string | null;
  hashtags: string[] | null;
  format: string | null;
  scheduled_at: string | null;
  published_at: string;
  dragonshare_post_id: string | null;
  verified_at: string;
}

/**
 * Build the social_post_log row for one (postId, platform) pair.
 *
 * `dragonshare_post_id` mirrors DonnyProvider.tsx's publishDraft: only
 * DragonShare-sourced drafts carry one, read from metadata.post_id when
 * metadata.source is 'dragonshare_social_hook'.
 *
 * The `meta.post_id` read is an UNCHECKED cast (`as string | undefined`),
 * matching outstand-webhook's live, deployed behaviour exactly — this was
 * deliberately preserved during the extraction that unified this function
 * (2026-08-06), not tightened. A non-string post_id passes through as-is
 * rather than being coerced to null, and would fail the row's uuid-column
 * insert (the whole upsert batch rejected, surfaced as a 500 for Outstand to
 * retry on the webhook path) rather than silently writing a null. Before
 * this extraction, reconcile-social-posts had independently shipped a
 * stricter `typeof === 'string'` guard here — a real, if low-probability,
 * behavioural divergence from the webhook's live code (a malformed post_id
 * would have silently recorded with dragonshare_post_id: null instead of
 * failing loud) — reported and closed by this unification, not silently
 * reconciled. See task-3-report.md's addendum.
 *
 * `metadata.source` IS typeof-checked (unlike post_id): resolvePostType's
 * `SOURCE_TO_POST_TYPE.get(source)` and the `=== 'dragonshare_social_hook'`
 * comparison both already fail closed on any non-string value exactly the
 * same way a typeof guard would (a Map lookup with a non-string key simply
 * misses; `x === 'literal'` is false for any non-string x) — so checking it
 * explicitly here is observably identical to the webhook's unchecked cast,
 * just clearer to read. Confirmed equivalent for every input, not assumed.
 */
export function buildSocialPostLogRow(
  postId: string,
  platform: string,
  publishedAt: string,
  sched: ScheduledPostForLogRow,
  verifiedAt: string,
): SocialPostLogRow {
  const meta = sched.metadata ?? {};
  const source = typeof meta.source === 'string' ? meta.source : null;
  const postType = resolvePostType(source, sched.campaign_id);
  const dragonsharePostId =
    source === 'dragonshare_social_hook'
      ? ((meta.post_id as string | undefined) ?? null)
      : null;

  return {
    user_id: sched.user_id,
    campaign_id: sched.campaign_id,
    outstand_post_id: postId,
    platform,
    post_type: postType,
    caption: sched.caption,
    hashtags: sched.hashtags,
    // content_type IS the format vocabulary. Never inferred from a URL: a
    // wrong format is indistinguishable from a real finding downstream.
    format: sched.content_type ?? null,
    scheduled_at: sched.scheduled_at,
    published_at: publishedAt,
    dragonshare_post_id: dragonsharePostId,
    verified_at: verifiedAt,
  };
}
