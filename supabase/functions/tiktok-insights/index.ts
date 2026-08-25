// tiktok-insights — metrics for the caller's connected TikTok account.
//
// Read-only. Returns figures or a typed error; tokens never leave the backend.
//
// NO CLAIM AROUND THE CACHE, AND THAT IS THE POINT OF DIFFERENCE FROM X.
// `x-insights` serialises its cache fill because X bills per read, so two tabs
// arriving after expiry would both miss, both call X, and both be invoiced.
// TikTok's Display API is free; a duplicate read costs a few hundred
// milliseconds. Importing that machinery would add a lock whose justification is
// absent — and every lock is a place a claim can be stranded and block a user for
// a TTL. The cache here is a plain last-write-wins timestamp.
//
// What the cache write DOES still refuse is an account that moved mid-read. See
// `cache_tiktok_insights`.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { TikTokError, TikTokReconnectRequiredError } from '../_shared/tiktok-api.ts';
import {
  getUsableAccessToken,
  INSIGHTS_CACHE_SECONDS,
  isCacheUsable,
  loadConnection,
  markNeedsReconnect,
} from '../_shared/tiktok-connection.ts';
import { fetchInsights } from '../_shared/tiktok-metrics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const conn = await loadConnection(supabase, user.id);
    if (!conn) {
      return json(req, { error: 'not_connected', message: 'No TikTok account is connected' }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    if (!force && conn.insights && isCacheUsable(conn.insights_cached_at, INSIGHTS_CACHE_SECONDS)) {
      return json(req, {
        insights: conn.insights,
        cached: true,
        cached_at: conn.insights_cached_at,
      });
    }

    // THE STORED EXPIRY CANNOT SEE A REVOKED TOKEN. A user who removes the app in
    // TikTok's settings invalidates it immediately, while
    // `access_token_expires_at` goes on looking healthy for up to 24 hours.
    // Passing that failure straight through would leave the connection broken for
    // a day with no reconnect button offered, because nothing had noticed.
    //
    // So one retry with a forced refresh. If the grant is genuinely gone the
    // refresh raises TikTokReconnectRequiredError, which becomes the 409 that
    // shows the button.
    let insights;
    try {
      const accessToken = await getUsableAccessToken(supabase, conn);
      insights = await fetchInsights(accessToken);
    } catch (e) {
      if (!(e instanceof TikTokReconnectRequiredError)) throw e;

      const refreshed = await getUsableAccessToken(supabase, conn, { force: true });

      // A forced refresh can legitimately hand back a token for a DIFFERENT
      // account, because the failure may have been caused by the user
      // reconnecting elsewhere. Re-read the row and confirm the identity is
      // unchanged before spending the retry.
      const current = await loadConnection(supabase, user.id);
      if (!current || current.open_id !== conn.open_id) {
        return json(
          req,
          {
            error: 'connection_changed',
            message: 'Your TikTok connection changed while we were loading it. Reloading now.',
          },
          409,
        );
      }

      try {
        insights = await fetchInsights(refreshed);
      } catch (retryError) {
        if (retryError instanceof TikTokReconnectRequiredError) {
          await markNeedsReconnect(
            supabase,
            user.id,
            'TikTok rejected the connection even after refreshing it.',
          );
          throw retryError;
        }
        throw retryError;
      }
    }

    // ATTRIBUTION IS CHECKED SERVER-SIDE, NOT ASSUMED.
    //
    // `cache_tiktok_insights` refuses to write when the row's open_id no longer
    // matches the account these figures came from — the user reconnected to a
    // different TikTok account mid-read. Returning them anyway would put one
    // account's analytics under another account's name, and React Query would
    // cache that for fifteen minutes. See [[Honest Analytics]]: a real
    // measurement attributed to the wrong subject is a fabrication even though
    // every figure in it is true.
    const { data: cached, error: cacheError } = await supabase.rpc('cache_tiktok_insights', {
      p_user_id: user.id,
      p_open_id: insights.account.open_id,
      p_insights: insights,
      p_follower_count: insights.account.follower_count,
      p_following_count: insights.account.following_count,
      p_likes_count: insights.account.likes_count,
      p_video_count: insights.account.video_count,
      p_display_name: insights.account.display_name,
      p_username: insights.account.username,
      p_avatar_url: insights.account.avatar_url,
    });

    // Checked as "not cached" rather than by enumerating reasons: a reason added
    // later would otherwise fall through to the success path by default, and the
    // safe default here is to discard.
    if (!cacheError && cached?.cached === false) {
      return json(
        req,
        {
          error: 'connection_changed',
          message: 'Your TikTok connection changed while we were loading it. Reloading now.',
        },
        409,
      );
    }

    // The read already happened, so failing the request here would lose an answer
    // we hold over a bookkeeping problem. Logged loudly, because a cache that
    // silently never writes turns every render into a live API call — free here,
    // but slow, and it would hide a real fault.
    if (cacheError) {
      console.error('[tiktok-insights] could not cache snapshot:', cacheError.message);
    }

    return json(req, { insights, cached: false, cached_at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof TikTokReconnectRequiredError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    if (err instanceof TikTokError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[tiktok-insights] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not load TikTok analytics' }, 500);
  }
});
