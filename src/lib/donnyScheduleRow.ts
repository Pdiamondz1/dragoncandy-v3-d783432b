// The `donny_scheduled_posts` row for a post published from a Donny draft card.
//
// Every other cross-post path already writes one — `SocialPostPrompt`
// (`syncScheduledPost` for immediate, its own insert for each scheduled slot)
// and `PostingPlanReview`. The Donny draft card did not, so a post scheduled
// through Donny went out upstream and then vanished from the product: the
// calendar, `UpcomingPostsWidget`, `SocialPostStatus` and `PostManagementPanel`
// all read this table. Found by Codex.
//
// Pure and separate from the component so the parts that must match the live
// CHECK constraints are testable without rendering anything.
import { toDbContentType, type DbContentType } from '@/lib/contentType';

/**
 * The exact vocabulary of the live `donny_scheduled_posts.platform` CHECK,
 * verified against prod 2026-08-09:
 *   instagram, tiktok, youtube, twitter, facebook, x
 *
 * Note `twitter` AND `x` both remain — the value was widened, not replaced
 * (migration `20260806090000`), because removing a CHECK value would orphan
 * existing rows. `x` is canonical going forward.
 *
 * KNOWN GAP: `threads` is a platform `describeAccount` can label but this CHECK
 * does NOT allow. A Threads account therefore publishes fine and then fails to
 * record, surfacing as "posted, but not saved" rather than silently. That is
 * deliberate — the alternative is mapping it onto some other platform, which
 * files the row under a lie, and a wrong row is worse than a missing one for
 * every downstream reader ([[Honest Analytics]]). Widening the CHECK is the
 * real fix and is a migration, not a mapping.
 */
export const SCHEDULE_ROW_PLATFORMS = [
  'instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'x',
] as const;

export interface DonnyScheduleRow {
  user_id: string;
  campaign_id: null;
  platform: string;
  content_type: DbContentType;
  caption: string;
  media_urls: string[];
  scheduled_at: string;
  published_at: string | null;
  status: 'scheduled' | 'published';
  ai_suggested_time: false;
  metadata: {
    outstand_post_id: string | null;
    social_account_ids: string[];
    source: 'donny_draft';
    /** True when content_type was a guess with no positive evidence. */
    content_type_inferred: boolean;
  };
}

const VIDEO_URL_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv']);

/**
 * 'video' only on positive evidence — a recognized video extension. Anything
 * else (no media at all, or an unrecognized/absent extension) falls back to
 * 'photo', which is a GUESS: this never positively detects a photo, and the
 * CHECK has no text-only value for a caption-only post. `content_type` is NOT
 * NULL so something must be written, hence `content_type_inferred` on the row
 * so a downstream reader can tell a finding from a fallback. Mirrors
 * `derivePlannerContentType` in useSponsorshipAmplification, which exists for
 * the same reason on the amplification path.
 */
function deriveContentType(mediaUrls: string[]): { contentType: DbContentType; confident: boolean } {
  const hasVideo = mediaUrls.some((url) => {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    return VIDEO_URL_EXTENSIONS.has(ext);
  });
  return hasVideo
    ? { contentType: toDbContentType('video'), confident: true }
    : { contentType: toDbContentType('photo'), confident: false };
}

export function buildDonnyScheduleRow(input: {
  userId: string;
  platform: string;
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  /** The draft's scheduled time, or null for a post sent immediately. */
  scheduledAt: string | null;
  outstandPostId: string | null;
  /** Injected so this stays pure and its tests need no clock. */
  now: string;
}): DonnyScheduleRow {
  const { contentType, confident } = deriveContentType(input.mediaUrls);

  // An immediate post is already live, so it is recorded as published AT the
  // moment it went out — not as a schedule row that some sweep will later
  // wonder about. This mirrors syncScheduledPost's `status: 'published'` +
  // `published_at` branch rather than inventing a second convention.
  const immediate = !input.scheduledAt;
  const scheduledAt = input.scheduledAt ?? input.now;

  return {
    user_id: input.userId,
    // Donny drafts are never campaign-bound. Explicitly null rather than
    // omitted: resolvePostType(source, campaignId) falls back to the campaign
    // when one is present, and 'standalone' is the correct answer here.
    campaign_id: null,
    platform: input.platform,
    content_type: contentType,
    caption: input.caption,
    media_urls: input.mediaUrls,
    scheduled_at: scheduledAt,
    published_at: immediate ? scheduledAt : null,
    status: immediate ? 'published' : 'scheduled',
    // Donny proposes the time the USER asked for; he does not pick an optimal
    // slot, so claiming an AI-suggested time here would be false.
    ai_suggested_time: false,
    metadata: {
      outstand_post_id: input.outstandPostId,
      social_account_ids: input.accountIds,
      // Deliberately NOT added to post-type.ts's SOURCE_TO_POST_TYPE: with no
      // campaign_id, resolvePostType already returns 'standalone', which is
      // what a Donny-composed post IS. A mapping entry would be a no-op at
      // best and a wrong post_type at worst — content-strategy-recommend
      // groups by that column, so a wrong value skews every recommendation.
      // The key is here for provenance, not for routing.
      source: 'donny_draft',
      content_type_inferred: !confident,
    },
  };
}
