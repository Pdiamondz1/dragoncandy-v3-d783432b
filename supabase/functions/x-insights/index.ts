// x-insights — metrics for the caller's connected X account.
//
// Read-only. Returns figures or a typed error; tokens never leave the backend.
//
// THE CACHE IS THE COST CONTROL. X bills per read (~$0.010 a user read, ~$0.005
// a post read) where YouTube, Instagram and Facebook insights are free. This
// card renders on three settings surfaces, so reading X on every render bills us
// per render, per surface, per user. A cached snapshot on the row is served for
// 15 minutes and `?refresh=1` is deliberately NOT offered as a free bypass —
// see `force` handling below.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { XError } from '../_shared/x-api.ts';
import {
  getUsableAccessToken,
  INSIGHTS_CACHE_SECONDS,
  isCacheUsable,
  loadConnection,
  markNeedsReconnect,
  TABLE,
  XReconnectRequiredError,
} from '../_shared/x-connection.ts';
import { fetchInsights } from '../_shared/x-metrics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * The shortest age at which a manual refresh will actually call X.
 *
 * A "Refresh" button that always spends money is a button that costs whatever a
 * bored user decides. Below this age the button returns the cached snapshot and
 * says when it was taken, which is honest and free.
 */
const FORCE_REFRESH_FLOOR_SECONDS = 60;

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
      return json(req, { error: 'not_connected', message: 'No X account is connected' }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    // A forced refresh still respects a floor, so the button cannot be held down
    // for money.
    const cacheWindow = force ? FORCE_REFRESH_FLOOR_SECONDS : INSIGHTS_CACHE_SECONDS;

    if (conn.insights && isCacheUsable(conn.insights_cached_at, cacheWindow)) {
      return json(req, {
        insights: conn.insights,
        cached: true,
        cached_at: conn.insights_cached_at,
      });
    }

    // THE STORED EXPIRY CANNOT SEE A REVOKED TOKEN. X invalidates immediately
    // when a user removes the app at x.com, while `access_token_expires_at` goes
    // on looking healthy for up to two hours. Passing that 401 straight through
    // would leave the connection broken for the whole window with no reconnect
    // button offered, because nothing had noticed anything was wrong.
    //
    // So a 401 buys exactly one retry with a forced refresh. If the grant is
    // genuinely gone the refresh raises XReconnectRequiredError, which the
    // catch below turns into the 409 that shows the button. If it survives the
    // refresh and still 401s, the grant is dead in a way a refresh cannot fix
    // and we say so rather than looping.
    let insights;
    try {
      const accessToken = await getUsableAccessToken(supabase, conn);
      insights = await fetchInsights(accessToken, conn.x_user_id);
    } catch (e) {
      if (!(e instanceof XError) || e.code !== 'unauthorized') throw e;

      const refreshed = await getUsableAccessToken(supabase, conn, { force: true });
      try {
        insights = await fetchInsights(refreshed, conn.x_user_id);
      } catch (retryError) {
        if (retryError instanceof XError && retryError.code === 'unauthorized') {
          await markNeedsReconnect(
            supabase,
            user.id,
            'X rejected the connection even after refreshing it.',
          );
          throw new XReconnectRequiredError(
            'X has ended this connection. Reconnect your account to keep seeing analytics.',
          );
        }
        throw retryError;
      }
    }

    // Store the snapshot AND the account figures it carries, so the status card
    // has a current follower count without a second billed read.
    const { error: writeError } = await supabase
      .from(TABLE)
      .update({
        insights,
        insights_cached_at: new Date().toISOString(),
        username: insights.account.username,
        display_name: insights.account.display_name,
        followers_count: insights.account.followers_count,
        following_count: insights.account.following_count,
        tweet_count: insights.account.tweet_count,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', conn.id);

    // The read already happened and was already billed, so failing the request
    // here would charge the user twice for one answer. Logged, not thrown — but
    // logged loudly, because a cache that silently never writes turns every
    // render into a paid read.
    if (writeError) {
      console.error('[x-insights] could not cache snapshot:', writeError.message);
    }

    return json(req, { insights, cached: false, cached_at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof XReconnectRequiredError) {
      // 409 with a distinct code so the card shows the reconnect button rather
      // than a generic failure. The distinction matters: telling a user to
      // reauthorize over a rate limit or a network blip is the mistake the
      // YouTube connector made with quota 403s.
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    if (err instanceof XError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[x-insights] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not load X analytics' }, 500);
  }
});
