import type { ContentType } from '@/types/campaignMedia';

/** Minutes per deliverable (shoot + edit combined) */
export const DELIVERABLE_TIME_MINUTES: Record<ContentType, number> = {
  photo: 60,
  video_reel: 75,
  story: 40,
  carousel: 120,
  tiktok: 75,
  youtube_short: 75,
};

/** Override for video types when max_duration_seconds > LONG_VIDEO_THRESHOLD_SECONDS */
export const LONG_VIDEO_TIME_MINUTES: Partial<Record<ContentType, number>> = {
  video_reel: 105,
  tiktok: 105,
  youtube_short: 105,
};

/** Edit portion of total time — used for footage discount calculation */
export const EDIT_RATIOS: Record<ContentType, number> = {
  photo: 0.50,
  video_reel: 0.60,
  story: 0.50,
  carousel: 0.50,
  tiktok: 0.60,
  youtube_short: 0.60,
};

/** Long-video edit ratios (when max_duration_seconds > LONG_VIDEO_THRESHOLD_SECONDS) */
export const LONG_VIDEO_EDIT_RATIOS: Partial<Record<ContentType, number>> = {
  video_reel: 0.57,
  tiktok: 0.57,
  youtube_short: 0.57,
};

export const TRAVEL_BUFFER_MINUTES = 30;
export const REVIEW_BUFFER_MINUTES = 15;
export const FOOTAGE_DISCOUNT = 0.3;
export const LONG_VIDEO_THRESHOLD_SECONDS = 30;

/** Tier validation thresholds in minutes */
export const TIER_THRESHOLDS = {
  dragondash: { warn: 180, block: 210 },
  express: { warn: 360, block: null },
  standard: { warn: null, block: null },
} as const;

/** Human-readable content type labels */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  photo: 'Photo',
  video_reel: 'Video Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YouTube Short',
};
