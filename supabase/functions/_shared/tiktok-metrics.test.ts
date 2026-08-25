import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchVideos,
  MAX_VIDEOS,
  num,
  parseAccount,
  parseVideos,
  summarize,
  sumOrNull,
  USER_FIELDS,
  VIDEO_FIELDS,
  type TikTokAccount,
  type TikTokVideo,
} from './tiktok-metrics.ts';
import { TikTokError, TikTokReconnectRequiredError } from './tiktok-api.ts';

/**
 * Real execution tests. Every rule here is an [[Honest Analytics]] rule or a
 * TikTok-specific fact that a sibling connector would have got wrong — and each
 * exists because the opposite behaviour looks completely fine on a dashboard.
 */

const ACCOUNT: TikTokAccount = {
  open_id: 'open-1',
  union_id: 'union-1',
  display_name: 'DragonCandy',
  username: 'dragoncandy',
  avatar_url: null,
  profile_deep_link: null,
  follower_count: 12,
  following_count: 3,
  likes_count: 40,
  video_count: 5,
};

const video = (over: Partial<TikTokVideo> = {}): TikTokVideo => ({
  id: 'v1',
  created_at: '2026-08-01T00:00:00.000Z',
  title: 'hello',
  duration: 10,
  cover_image_url: null,
  share_url: null,
  views: null,
  likes: null,
  comments: null,
  shares: null,
  ...over,
});

describe('num', () => {
  it('keeps a genuine zero', () => {
    expect(num(0)).toBe(0);
  });

  it('does NOT turn null into zero', () => {
    // Number(null) is 0 and 0 is finite, so a Number.isFinite(Number(x)) guard
    // admits null. That exact bug shipped in the Instagram connector's first
    // draft: a day the platform said nothing about became a day with zero reach.
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num('12')).toBeNull();
  });
});

describe('sumOrNull', () => {
  it('returns null — NOT 0 — when nothing was measured', () => {
    expect(sumOrNull([null, null])).toBeNull();
    expect(sumOrNull([])).toBeNull();
  });

  it('ignores absent values rather than counting them as zero', () => {
    expect(sumOrNull([5, null, 5])).toBe(10);
  });

  it('keeps a genuine zero total', () => {
    expect(sumOrNull([0, 0])).toBe(0);
  });
});

describe('parseVideos', () => {
  it('reads create_time as SECONDS, not milliseconds', () => {
    // TikTok returns UNIX seconds. Treating it as ms puts every video in 1970
    // and sorts them identically — which looks exactly like working code.
    const { videos } = parseVideos({
      data: { videos: [{ id: 'a', create_time: 1_785_000_000 }] },
    });
    expect(videos[0].created_at).toBe(new Date(1_785_000_000 * 1000).toISOString());
    expect(new Date(videos[0].created_at as string).getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('keeps a metric TikTok omitted as null', () => {
    const { videos } = parseVideos({ data: { videos: [{ id: 'a' }] } });
    expect(videos[0].views).toBeNull();
    expect(videos[0].likes).toBeNull();
  });

  it('returns an empty list when TikTok sent no videos key', () => {
    expect(parseVideos({}).videos).toEqual([]);
    expect(parseVideos({}).hasMore).toBe(false);
  });

  it('falls back to video_description when title is empty', () => {
    const { videos } = parseVideos({
      data: { videos: [{ id: 'a', title: '', video_description: 'a caption' }] },
    });
    expect(videos[0].title).toBe('a caption');
  });
});

describe('parseAccount', () => {
  it('throws when there is no open_id rather than inventing an account', () => {
    expect(() => parseAccount({ data: { user: {} } })).toThrow(TikTokError);
  });

  it('keeps absent stats as null', () => {
    const account = parseAccount({ data: { user: { open_id: 'x' } } });
    expect(account.follower_count).toBeNull();
    expect(account.username).toBeNull();
  });
});

describe('summarize', () => {
  it('reports how many videos the figures came from', () => {
    const s = summarize(ACCOUNT, [video(), video({ id: 'v2' })], false);
    expect(s.videos_counted).toBe(2);
  });

  it('reports has_more rather than hiding it', () => {
    // The card must be able to say the figures describe a page, not a lifetime.
    expect(summarize(ACCOUNT, [video()], true).has_more).toBe(true);
  });

  it('gives an all-null total for an account with nothing measured', () => {
    const s = summarize(ACCOUNT, [video(), video({ id: 'v2' })], false);
    expect(s.totals.views).toBeNull();
    expect(s.totals.likes).toBeNull();
  });

  it('gives an empty summary for an account with no videos, not a row of zeros', () => {
    const s = summarize(ACCOUNT, [], false);
    expect(s.videos_counted).toBe(0);
    expect(s.top_videos).toEqual([]);
    expect(s.totals.views).toBeNull();
  });

  it('sorts an unmeasured video BELOW a measured zero', () => {
    // Ranking null as 0 would interleave "we do not know" with "nobody watched
    // it", and the card would present the first as the second.
    const s = summarize(
      ACCOUNT,
      [video({ id: 'unknown', views: null }), video({ id: 'zero', views: 0 })],
      false,
    );
    expect(s.top_videos.map((v) => v.id)).toEqual(['zero', 'unknown']);
  });

  it('caps top videos at five', () => {
    const many = Array.from({ length: 9 }, (_, i) => video({ id: `v${i}`, views: i }));
    expect(summarize(ACCOUNT, many, false).top_videos).toHaveLength(5);
  });
});

describe('the constants are decisions, not defaults', () => {
  it('caps at TikTok\'s documented maximum of 20', () => {
    // TikTok's own limit. Asking for more is rejected, and asking for fewer
    // silently narrows the card.
    expect(MAX_VIDEOS).toBe(20);
  });

  it('requests username but NOT bio_description or is_verified', () => {
    // The user.info.profile scope covers all three. We take the scope for the
    // @handle and fetch nothing else from it, so we hold nothing we do not use.
    expect(USER_FIELDS).toContain('username');
    expect(USER_FIELDS).not.toContain('bio_description');
    expect(USER_FIELDS).not.toContain('is_verified');
  });

  it('asks for the four engagement metrics the card renders', () => {
    for (const f of ['view_count', 'like_count', 'comment_count', 'share_count']) {
      expect(VIDEO_FIELDS).toContain(f);
    }
  });
});

/**
 * TikTok returns HTTP 200 for application-level failures and puts the real
 * outcome in `error.code`. Getting this wrong does not produce an error — it
 * produces a card full of em dashes, i.e. a broken connection that looks merely
 * quiet.
 */
describe('the {data, error} envelope is the authority, not the status line', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('treats error.code "ok" as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respond(200, { data: { videos: [{ id: 'a', view_count: 3 }], has_more: false }, error: { code: 'ok' } }),
      ),
    );
    const { videos } = await fetchVideos('token');
    expect(videos[0].views).toBe(3);
  });

  it('raises reconnect-required on an invalid token even though HTTP is 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respond(200, { data: {}, error: { code: 'access_token_invalid', message: 'bad' } }),
      ),
    );
    await expect(fetchVideos('token')).rejects.toBeInstanceOf(TikTokReconnectRequiredError);
  });

  it('does NOT treat an unknown error code as success', async () => {
    // Enumerate the good case. A guard that lists the bad codes treats every
    // code it has not met as success, which here means rendering an empty card
    // as though it were measured.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(200, { data: {}, error: { code: 'something_new' } })),
    );
    await expect(fetchVideos('token')).rejects.toBeInstanceOf(TikTokError);
  });

  it('refuses a response with NO envelope rather than reading it as empty', async () => {
    // The first draft guarded with `code !== null && code !== 'ok'`, so a
    // response carrying no `error` object fell through to success — and
    // parseVideos({}) yields an empty list, which was then cached and rendered
    // as "no recent videos". An upstream failure presented as a fact about the
    // account. Fails closed now.
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { unexpected: true })));
    const err = await fetchVideos('token').catch((e) => e);
    expect(err).toBeInstanceOf(TikTokError);
    expect((err as TikTokError).code).toBe('bad_response');
  });

  it('reports a rate limit as rate-limited, never as a dead connection', async () => {
    // Telling a user to reauthorize over a rate limit is the mistake the YouTube
    // connector made with quota 403s.
    vi.stubGlobal('fetch', vi.fn(async () => respond(429, { error: { code: 'rate_limit_exceeded' } })));
    const err = await fetchVideos('token').catch((e) => e);
    expect(err).toBeInstanceOf(TikTokError);
    expect(err).not.toBeInstanceOf(TikTokReconnectRequiredError);
    expect((err as TikTokError).code).toBe('rate_limited');
  });

  it('puts fields in the QUERY STRING and max_count in the BODY', async () => {
    // TikTok's own split, and the easiest thing to get wrong on this endpoint:
    // putting `fields` in the body returns 200 with videos carrying only `id`,
    // which looks like an account whose every metric is absent.
    const spy = vi.fn(async () => respond(200, { data: { videos: [] }, error: { code: 'ok' } }));
    vi.stubGlobal('fetch', spy);

    await fetchVideos('token');

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('fields=');
    expect(String(url)).toContain('view_count');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ max_count: MAX_VIDEOS });
    expect(String(init.body)).not.toContain('fields');
  });
});
