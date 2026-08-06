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
 * The `meta.post_id` read is DELIBERATELY typeof-checked
 * (`typeof === 'string'`), not an unchecked cast — this is the harder-won of
 * the two directions this extraction (2026-08-06) could have unified to, and
 * it was chosen on purpose, not for consistency's sake. Before the
 * extraction, outstand-webhook's live code used an unchecked
 * `as string | undefined` cast here; reconcile-social-posts independently
 * shipped this stricter guard. `social_post_log.dragonshare_post_id` is a
 * `uuid` column (verified against prod schema) with no CHECK softening a bad
 * value — a non-string post_id (a number, an object) under the unchecked
 * cast is passed straight through and fails Postgres's uuid coercion, and
 * because the upsert writes every platform's row for a post in ONE call, a
 * single bad row fails the ENTIRE batch: the whole post goes permanently
 * unrecorded (the webhook path surfaces this as a 500, Outstand retries up
 * to 5x against the same unfixable data, then gives up). The strict guard
 * instead writes `dragonshare_post_id: null` for that one row: the upsert
 * succeeds, the post is measured, and only the brief->outcome attribution
 * link is missing. Losing one nullable field beats losing the whole
 * measurement — outstand-webhook inherits this hardening on its next
 * deploy (required for this branch regardless, since it now imports this
 * module). See task-3-report.md's addendum for the reasoning trail.
 *
 * `metadata.source` is typeof-checked too, but that one was never a
 * divergence: resolvePostType's `SOURCE_TO_POST_TYPE.get(source)` and the
 * `=== 'dragonshare_social_hook'` comparison both already fail closed on any
 * non-string value the same way a typeof guard would (a Map lookup with a
 * non-string key simply misses; `x === 'literal'` is false for any
 * non-string x) — confirmed observably identical to the webhook's original
 * unchecked cast for every input, not assumed.
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
      ? (typeof meta.post_id === 'string' ? meta.post_id : null)
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
