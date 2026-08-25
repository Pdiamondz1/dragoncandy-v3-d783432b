/**
 * Reading metrics for a connected TikTok account.
 *
 * Two calls: the user's profile+stats, and a page of recent videos.
 *
 * COST IS NOT A DESIGN INPUT HERE, AND THAT IS THE DIFFERENCE FROM X. TikTok's
 * Display API is free — no per-call fee anywhere on its developer portal — where
 * X bills ~$0.005 a post read and ~$0.010 a user read. Everything X does to
 * avoid a duplicate read (a claim around the cache fill, a 60-second floor under
 * the refresh button, a refusal to paginate) is a COST control, and importing it
 * here would be complexity with its justification removed. The constraint that
 * does exist is a 600 requests/minute sliding window per endpoint, which this
 * does not approach.
 *
 * [[Honest Analytics]] applies throughout: a metric TikTok did not return is
 * `null` and renders as an em dash. It is never coerced to 0, because a real
 * zero and an absent measurement are different facts and only one of them is
 * ours to assert.
 */

import { TikTokError, TikTokReconnectRequiredError } from './tiktok-api.ts';

const API = 'https://open.tiktokapis.com';

/**
 * TikTok caps `max_count` at 20 (default 10). X allowed 100.
 *
 * Pagination is deliberately not implemented — but for a DIFFERENT reason than
 * on X, and the distinction matters if anyone revisits it. There, each extra
 * page was billed. Here it is free, and the reason is honesty: a summary card
 * does not get more truthful with more rows, and `videos_counted` is reported so
 * the figure can never be mistaken for "all your videos".
 */
export const MAX_VIDEOS = 20;

/**
 * Requested from the profile scopes.
 *
 * `bio_description` and `is_verified` are covered by the `user.info.profile`
 * scope we hold and are DELIBERATELY NOT REQUESTED — a scope is not the same as
 * what you fetch, and we should hold nothing we do not use. `username` is the
 * only reason that scope is requested at all.
 */
export const USER_FIELDS = [
  'open_id',
  'union_id',
  'display_name',
  'avatar_url',
  'username',
  'profile_deep_link',
  'follower_count',
  'following_count',
  'likes_count',
  'video_count',
] as const;

export const VIDEO_FIELDS = [
  'id',
  'create_time',
  'title',
  'video_description',
  'duration',
  'cover_image_url',
  'share_url',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
] as const;

export interface TikTokAccount {
  open_id: string;
  union_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_deep_link: string | null;
  follower_count: number | null;
  following_count: number | null;
  likes_count: number | null;
  video_count: number | null;
}

export interface TikTokVideo {
  id: string;
  created_at: string | null;
  title: string | null;
  duration: number | null;
  cover_image_url: string | null;
  share_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface TikTokInsights {
  account: TikTokAccount;
  /** How many videos the figures below are actually derived from. */
  videos_counted: number;
  /** True when TikTok says there are more than we asked for. Reported, not hidden. */
  has_more: boolean;
  totals: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  };
  top_videos: TikTokVideo[];
  fetched_at: string;
}

export function num(v: unknown): number | null {
  // Number(null) is 0 and 0 is finite, so a `Number.isFinite(Number(x))` guard
  // admits null and turns "TikTok reported nothing" into a real zero. That exact
  // bug shipped in the Instagram connector's first draft; the totals still added
  // up and only the day count betrayed it.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Sum that stays null when nothing was measured.
 *
 * `[].reduce((a, b) => a + b, 0)` is 0, which would print a confident zero for
 * an account we measured nothing about. Absent and zero are different claims.
 */
export function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/**
 * TikTok wraps EVERY response in `{ data, error }` and returns HTTP 200 for
 * application-level failures, with the real outcome in `error.code`.
 *
 * `error.code === 'ok'` is success. Checking `res.ok` alone would treat an
 * expired token or a missing scope as a successful empty response — and an empty
 * response here renders as a card full of em dashes, i.e. a broken connection
 * that looks merely quiet. The body is the authority; the status line is not.
 */
async function tiktokFetch(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    throw new TikTokError('network_error', `Could not reach TikTok: ${(e as Error).message}`, 502);
  }

  const text = await res.text();

  if (res.status === 429) {
    // Rate limited, not broken. Saying so stops a user reconnecting an account
    // that is perfectly healthy — the mistake the YouTube connector made when it
    // treated a quota 403 as "reauthorize".
    throw new TikTokError(
      'rate_limited',
      'TikTok is rate-limiting this account. The numbers below will refresh shortly.',
      429,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TikTokError('bad_response', 'TikTok returned a non-JSON response', 502);
  }

  const err = (payload.error ?? {}) as Record<string, unknown>;
  const code = typeof err.code === 'string' ? err.code : null;

  // ENUMERATE THE GOOD CASE. A guard that lists the bad codes treats every code
  // it has not met as success — which for this envelope means rendering an empty
  // card as though it were measured. Codex round 12 on the X connector was
  // exactly this shape.
  if (code !== null && code !== 'ok') {
    const message = typeof err.message === 'string' ? err.message : code;

    if (['access_token_invalid', 'token_expired', 'scope_not_authorized'].includes(code)) {
      throw new TikTokReconnectRequiredError(
        'TikTok has ended this connection. Reconnect the account to keep seeing analytics.',
      );
    }
    if (code === 'rate_limit_exceeded') {
      throw new TikTokError(
        'rate_limited',
        'TikTok is rate-limiting this account. The numbers below will refresh shortly.',
        429,
      );
    }
    throw new TikTokError('tiktok_error', `TikTok returned ${code}: ${message}`, 502);
  }

  if (!res.ok) {
    throw new TikTokError(
      'tiktok_error',
      `TikTok returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  return payload;
}

export function parseAccount(payload: Record<string, unknown>): TikTokAccount {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const user = (data.user ?? {}) as Record<string, unknown>;

  const openId = str(user.open_id);
  if (!openId) {
    throw new TikTokError('bad_response', 'TikTok returned no account', 502);
  }

  return {
    open_id: openId,
    union_id: str(user.union_id),
    display_name: str(user.display_name),
    username: str(user.username),
    avatar_url: str(user.avatar_url),
    profile_deep_link: str(user.profile_deep_link),
    follower_count: num(user.follower_count),
    following_count: num(user.following_count),
    likes_count: num(user.likes_count),
    video_count: num(user.video_count),
  };
}

export function parseVideos(payload: Record<string, unknown>): {
  videos: TikTokVideo[];
  hasMore: boolean;
} {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(data.videos) ? data.videos : [];

  const videos = raw.map((v) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const created = num(o.create_time);
    return {
      id: str(o.id) ?? '',
      // TikTok's create_time is UNIX SECONDS, not milliseconds. Treating it as
      // ms puts every video in 1970 and sorts them identically, which looks like
      // working code.
      created_at: created !== null ? new Date(created * 1000).toISOString() : null,
      title: str(o.title) ?? str(o.video_description),
      duration: num(o.duration),
      cover_image_url: str(o.cover_image_url),
      share_url: str(o.share_url),
      views: num(o.view_count),
      likes: num(o.like_count),
      comments: num(o.comment_count),
      shares: num(o.share_count),
    };
  });

  return { videos, hasMore: data.has_more === true };
}

export function summarize(
  account: TikTokAccount,
  videos: TikTokVideo[],
  hasMore: boolean,
): TikTokInsights {
  const top = [...videos]
    .sort((a, b) => {
      // An UNMEASURED video sorts BELOW a measured zero. Ranking null as 0 would
      // interleave "we do not know" with "nobody watched it", and the card would
      // present the first as the second.
      const av = a.views;
      const bv = b.views;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    })
    .slice(0, 5);

  return {
    account,
    videos_counted: videos.length,
    has_more: hasMore,
    totals: {
      views: sumOrNull(videos.map((v) => v.views)),
      likes: sumOrNull(videos.map((v) => v.likes)),
      comments: sumOrNull(videos.map((v) => v.comments)),
      shares: sumOrNull(videos.map((v) => v.shares)),
    },
    top_videos: top,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchAccount(accessToken: string): Promise<TikTokAccount> {
  const payload = await tiktokFetch(
    `/v2/user/info/?fields=${USER_FIELDS.join(',')}`,
    accessToken,
  );
  return parseAccount(payload);
}

export async function fetchVideos(
  accessToken: string,
  maxCount = MAX_VIDEOS,
): Promise<{ videos: TikTokVideo[]; hasMore: boolean }> {
  // THE FIELD LIST GOES IN THE QUERY STRING WHILE max_count GOES IN THE JSON
  // BODY — on the same POST. That split is TikTok's, not a mistake here, and it
  // is the single easiest thing to get wrong on this endpoint: putting `fields`
  // in the body returns a 200 with videos that carry only `id`, which looks like
  // an account whose every metric is absent.
  const payload = await tiktokFetch(
    `/v2/video/list/?fields=${VIDEO_FIELDS.join(',')}`,
    accessToken,
    { method: 'POST', body: { max_count: Math.min(maxCount, MAX_VIDEOS) } },
  );
  return parseVideos(payload);
}

export async function fetchInsights(accessToken: string): Promise<TikTokInsights> {
  const account = await fetchAccount(accessToken);
  const { videos, hasMore } = await fetchVideos(accessToken);
  return summarize(account, videos, hasMore);
}
