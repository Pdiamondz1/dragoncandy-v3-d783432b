// youtube-analytics — read-only channel performance for the signed-in user.
//
// The point of the whole YouTube integration: Outstand publishes, this reads.
// Nothing here writes to YouTube, and the granted scopes cannot.
//
// Honesty rules this function follows, from [[Honest Analytics]]:
//   - an empty report is returned as zero rows, never synthesised into zeros;
//   - every ranking states its own N (`days_with_data`, `video_count`), so the
//     caller can gate rather than presenting a one-video "top videos" table;
//   - `average view duration` is DERIVED from the totals, not averaged from the
//     per-day averages, which would weight a 3-view day like a 3,000-view one.
//
// ENV: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { YouTubeError } from '../_shared/youtube.ts';
import {
  ensureAccessToken,
  loadConnection,
  markNeedsReconnect,
  markSynced,
  requireAnalyticsScope,
} from '../_shared/youtube-connection.ts';
import {
  fetchDailyReport,
  fetchTopVideosReport,
  fetchVideoTitles,
  shapeDaily,
  shapeTopVideos,
  toApiDate,
  totalsOf,
  videoIdsOf,
} from '../_shared/youtube-analytics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEFAULT_DAYS = 28;
const MAX_DAYS = 365;
const TOP_VIDEO_LIMIT = 10;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // --- Authenticate caller ---
    // The JWT is passed explicitly; getUser() with no argument on a service-role
    // client reads the client's own key as the session.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(req, { error: 'unauthorized', message: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.slice(7));

    if (authError || !user) {
      return json(req, { error: 'unauthorized', message: 'Invalid or expired token' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const channelId = typeof body?.channel_id === 'string' ? body.channel_id : undefined;

    // Clamp rather than reject: a nonsense window is a caller bug, and answering
    // for a sane range beats a 400 the UI has to special-case.
    const requestedDays = Number(body?.days);
    const days = Number.isFinite(requestedDays)
      ? Math.min(MAX_DAYS, Math.max(1, Math.floor(requestedDays)))
      : DEFAULT_DAYS;

    // Scoped to the caller — this filter is the authorization, because the table
    // has no RLS policies and the client here is service-role.
    const connection = await loadConnection(supabase, user.id, channelId);
    if (!connection) {
      return json(
        req,
        { error: 'not_connected', message: 'No YouTube channel is connected' },
        404,
      );
    }

    // Covers rows written before the callback learned to store this state.
    // `requireAnalyticsScope` refuses before we spend a Google call; marking the
    // row is what surfaces the Reconnect button that fixes it.
    try {
      requireAnalyticsScope(connection);
    } catch (err) {
      if (err instanceof YouTubeError && err.code === 'missing_scope') {
        await markNeedsReconnect(supabase, connection.id, err.message);
      }
      throw err;
    }

    const accessToken = await ensureAccessToken(supabase, connection);

    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startDate = toApiDate(start);
    const endDate = toApiDate(end);

    // Independent reads, so run them together. `fetchVideoTitles` cannot start
    // until the video report names its ids, so it stays sequential after.
    //
    // A 401/403 from Google here is `needs_reconnect`, and the ROW has to record
    // that — not just the response. `ensureAccessToken` marks the row when the
    // refresh token dies, but a token that refreshes fine can still be refused
    // by the Analytics API (the grant no longer covers it, or the account lost
    // access to the channel). Without this the row stays 'active', the card
    // keeps saying "Connected", the Reconnect button never appears, and every
    // later visit repeats the same failing request.
    let dailyReport;
    let topReport;
    try {
      [dailyReport, topReport] = await Promise.all([
        fetchDailyReport(accessToken, startDate, endDate),
        fetchTopVideosReport(accessToken, startDate, endDate, TOP_VIDEO_LIMIT),
      ]);
    } catch (err) {
      if (err instanceof YouTubeError && err.code === 'needs_reconnect') {
        await markNeedsReconnect(supabase, connection.id, err.message);
      }
      throw err;
    }

    const titles = await fetchVideoTitles(accessToken, videoIdsOf(topReport));
    const daily = shapeDaily(dailyReport);
    const topVideos = shapeTopVideos(topReport, titles);

    await markSynced(supabase, connection.id);

    return json(req, {
      channel: {
        channel_id: connection.channel_id,
        channel_title: connection.channel_title,
      },
      range: {
        start_date: startDate,
        end_date: endDate,
        days_requested: days,
      },
      totals: totalsOf(daily),
      daily,
      // The N behind every figure above. YouTube processes analytics with a lag
      // of a day or two, so a 28-day request routinely returns fewer days — and
      // a caller that assumed `days_requested` would quietly divide by the wrong
      // number.
      days_with_data: daily.length,
      top_videos: topVideos,
      video_count: topVideos.length,
    });
  } catch (err) {
    if (err instanceof YouTubeError) {
      console.error('[youtube-analytics]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[youtube-analytics] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not read analytics' }, 500);
  }
});
