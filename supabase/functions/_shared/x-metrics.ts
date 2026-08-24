/**
 * Reading metrics for a connected X account.
 *
 * Two calls, and the cost of each is a design input rather than a footnote:
 * X bills roughly $0.010 for a user read and $0.005 for a post read
 * (docs.x.com, 2026-08-23). YouTube, Instagram and Facebook insights are free,
 * so all three of those connectors read on every card render without thinking
 * about it. Here every read is money, which is why `x-connection.ts` caches the
 * result on the row and this module is only reached on a cache miss.
 *
 * ---------------------------------------------------------------------------
 * THE 28-DAY WINDOW IS LOAD-BEARING, NOT COSMETIC
 *
 * `public_metrics` has no time limit. `organic_metrics` — the half that carries
 * impressions, profile clicks and link clicks — is available ONLY for posts
 * created in the last 30 days, and only for posts the authenticated user wrote.
 *
 * So the window is not "28 days because the other connectors use 28 days". It
 * is 28 because asking for organic metrics on anything older returns errors for
 * those posts, and a two-day margin keeps a slow request from sliding over the
 * edge. Widening it silently degrades half the numbers on the card.
 * ---------------------------------------------------------------------------
 *
 * [[Honest Analytics]] applies throughout: a metric X did not return is `null`
 * and renders as an em dash. It is never coerced to 0, because a real zero and
 * an absent measurement are different facts and only one of them is ours to
 * assert.
 */

import { XError } from './x-api.ts';

const X_API = 'https://api.x.com';

/**
 * Deliberately shorter than the 30-day limit on organic metrics. See above.
 */
export const WINDOW_DAYS = 28;

/**
 * X caps `max_results` at 100 for the user-timeline endpoint. Pagination is
 * deliberately NOT implemented: each extra page is another billed read, and a
 * summary card does not become more truthful past 100 posts. `posts_counted` is
 * reported so the figure is never mistaken for "all your posts".
 */
export const MAX_POSTS = 100;

export interface XPostMetrics {
  id: string;
  created_at: string | null;
  text: string;
  /** Always present — `public_metrics` has no time limit. */
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  /**
   * Impressions. Present in `public_metrics` on recent posts and in
   * `organic_metrics`; null when X returned neither, never 0.
   */
  impressions: number | null;
  /** Organic only, so null outside the 30-day window. */
  profile_clicks: number | null;
  link_clicks: number | null;
}

export interface XAccountSummary {
  x_user_id: string;
  username: string | null;
  display_name: string | null;
  followers_count: number | null;
  following_count: number | null;
  tweet_count: number | null;
}

export interface XInsights {
  account: XAccountSummary;
  window_days: number;
  /** How many posts the figures below are actually derived from. */
  posts_counted: number;
  /**
   * How many of those carried organic metrics. Reported rather than assumed:
   * if this is lower than `posts_counted`, impressions and clicks describe a
   * SUBSET, and the card must say so instead of implying full coverage.
   */
  posts_with_organic: number;
  totals: {
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    impressions: number | null;
    profile_clicks: number | null;
    link_clicks: number | null;
  };
  top_posts: XPostMetrics[];
  fetched_at: string;
}

function num(v: unknown): number | null {
  // Number(null) is 0 and 0 is finite, so a `Number.isFinite(Number(x))` guard
  // admits null and turns "X reported nothing" into a real zero. That exact bug
  // shipped in the Instagram connector's first draft; the totals still added up
  // and only the day count betrayed it.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Sum that stays null when nothing was measured.
 *
 * `[].reduce((a, b) => a + b, 0)` is 0, which would print a confident zero for
 * a window in which we measured nothing at all. Absent and zero are different
 * claims.
 */
export function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

async function xGet(path: string, accessToken: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${X_API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    throw new XError('network_error', `Could not reach X: ${(e as Error).message}`, 502);
  }

  const text = await res.text();

  if (res.status === 401) {
    // The token is dead. Distinct from 403 below: this one is recoverable by
    // refreshing or reconnecting, and the caller acts on it.
    throw new XError('unauthorized', 'X rejected the access token', 401);
  }
  if (res.status === 429) {
    // Rate limited, not broken. Saying so stops a user reconnecting an account
    // that is perfectly healthy — the same mistake the YouTube connector made
    // when it treated a quota 403 as "reauthorize".
    throw new XError(
      'rate_limited',
      'X is rate-limiting this account. The numbers below will refresh shortly.',
      429,
    );
  }
  if (!res.ok) {
    // The UPSTREAM status, not a flat 502. A caller deciding whether a retry
    // could possibly help needs to know what X actually said — flattening every
    // failure into one code is how a 5xx outage ends up being treated as a
    // permission problem and retried for money.
    throw new XError('x_error', `X returned ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new XError('bad_response', 'X returned a non-JSON response', 502);
  }
}

export async function fetchAccount(accessToken: string): Promise<XAccountSummary> {
  const payload = await xGet('/2/users/me?user.fields=public_metrics,username,name', accessToken);
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data || typeof data.id !== 'string') {
    throw new XError('bad_response', 'X returned no account', 502);
  }
  const pm = (data.public_metrics ?? {}) as Record<string, unknown>;
  return {
    x_user_id: data.id,
    username: typeof data.username === 'string' ? data.username : null,
    display_name: typeof data.name === 'string' ? data.name : null,
    followers_count: num(pm.followers_count),
    following_count: num(pm.following_count),
    tweet_count: num(pm.tweet_count),
  };
}

export async function fetchPosts(
  accessToken: string,
  xUserId: string,
  windowDays = WINDOW_DAYS,
): Promise<{ posts: XPostMetrics[]; organicAvailable: boolean }> {
  const startTime = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    max_results: String(MAX_POSTS),
    start_time: startTime,
    'tweet.fields': 'created_at,public_metrics,organic_metrics',
    exclude: 'retweets,replies',
  });

  let payload: Record<string, unknown>;
  try {
    payload = await xGet(`/2/users/${xUserId}/tweets?${params}`, accessToken);
  } catch (e) {
    // `organic_metrics` needs the authenticated user to be the author and can be
    // refused outright on some accounts. Retrying WITHOUT it yields a smaller
    // but honest card, which beats failing the whole read — and the caller is
    // told coverage is partial rather than being handed silent nulls.
    //
    // NARROW ON PURPOSE, and it was not always. This used to retry on the
    // catch-all `x_error`, which `xGet` threw for EVERY non-401/429 failure — so
    // an X 5xx outage bought a second billed timeline read that could not
    // possibly succeed, on a connector where every read is money. A retry is
    // only worth paying for when the thing being removed is the thing that
    // failed.
    //
    // 403 is the permission refusal. The message check covers X answering 400
    // for an unsupported field combination, which it does for some accounts.
    const permissionRefusal =
      e instanceof XError &&
      (e.status === 403 || (e.status === 400 && /organic|metric/i.test(e.message)));

    if (permissionRefusal) {
      const fallback = new URLSearchParams({
        max_results: String(MAX_POSTS),
        start_time: startTime,
        'tweet.fields': 'created_at,public_metrics',
        exclude: 'retweets,replies',
      });
      const retry = await xGet(`/2/users/${xUserId}/tweets?${fallback}`, accessToken);
      return { posts: parsePosts(retry), organicAvailable: false };
    }
    throw e;
  }

  return { posts: parsePosts(payload), organicAvailable: true };
}

export function parsePosts(payload: Record<string, unknown>): XPostMetrics[] {
  // No `data` key at all means zero posts in the window. That is an empty list,
  // never a synthesised row of zeros.
  const rows = Array.isArray(payload.data) ? (payload.data as Record<string, unknown>[]) : [];

  return rows.map((row) => {
    const pm = (row.public_metrics ?? {}) as Record<string, unknown>;
    const om = (row.organic_metrics ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
      text: typeof row.text === 'string' ? row.text : '',
      likes: num(om.like_count) ?? num(pm.like_count),
      replies: num(om.reply_count) ?? num(pm.reply_count),
      reposts: num(om.retweet_count) ?? num(pm.retweet_count),
      quotes: num(pm.quote_count),
      impressions: num(om.impression_count) ?? num(pm.impression_count),
      profile_clicks: num(om.user_profile_clicks),
      link_clicks: num(om.url_link_clicks),
    };
  });
}

/**
 * Everything that turns posts into the card's figures. Pure on purpose — this
 * is where every [[Honest Analytics]] rule lives, and the rules are worth more
 * than the fetching around them, so they are testable without a network.
 */
export function summarize(
  account: XAccountSummary,
  posts: XPostMetrics[],
  windowDays = WINDOW_DAYS,
  now: Date = new Date(),
): XInsights {
  const postsWithOrganic = posts.filter(
    (p) => p.profile_clicks !== null || p.link_clicks !== null,
  ).length;

  // Ranked by impressions where we have them, falling back to likes. A post
  // with neither sorts LAST rather than being treated as a zero that beats
  // nothing — an unmeasured post is not a badly performing one.
  const ranked = [...posts].sort((a, b) => {
    const av = a.impressions ?? a.likes ?? -1;
    const bv = b.impressions ?? b.likes ?? -1;
    return bv - av;
  });

  return {
    account,
    window_days: windowDays,
    posts_counted: posts.length,
    posts_with_organic: postsWithOrganic,
    totals: {
      likes: sumOrNull(posts.map((p) => p.likes)),
      replies: sumOrNull(posts.map((p) => p.replies)),
      reposts: sumOrNull(posts.map((p) => p.reposts)),
      impressions: sumOrNull(posts.map((p) => p.impressions)),
      profile_clicks: sumOrNull(posts.map((p) => p.profile_clicks)),
      link_clicks: sumOrNull(posts.map((p) => p.link_clicks)),
    },
    top_posts: ranked.slice(0, 5),
    fetched_at: now.toISOString(),
  };
}

export async function fetchInsights(
  accessToken: string,
  xUserId: string,
  windowDays = WINDOW_DAYS,
): Promise<XInsights> {
  const account = await fetchAccount(accessToken);
  const { posts } = await fetchPosts(accessToken, xUserId, windowDays);
  return summarize(account, posts, windowDays);
}
