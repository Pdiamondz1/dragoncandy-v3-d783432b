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
  loadConnection,
  markNeedsReconnect,
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

  // Set once a claim is held, cleared once it is spent. Held in the outer scope
  // so the catch can release it — the body stream is consumed by then, so
  // re-reading the request there is not an option.
  let releaseClaim: (() => Promise<void>) | null = null;

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

    // CLAIM, don't just check. A bare `isCacheUsable` read lets two callers
    // arriving after the cache expires BOTH miss and BOTH call X — two tabs is
    // enough — so the cache remembers an answer without preventing the question
    // being asked twice, and every duplicate is billed. The claim serialises the
    // FILL.
    const { data: claim, error: claimError } = await supabase.rpc('claim_x_insights_read', {
      p_user_id: user.id,
      p_max_age_seconds: cacheWindow,
    });

    if (claimError) {
      return json(req, { error: 'storage_failed', message: claimError.message }, 500);
    }

    if (!claim?.claimed) {
      if (claim?.reason === 'no_connection') {
        return json(req, { error: 'not_connected', message: 'No X account is connected' }, 404);
      }

      // `fresh` — a usable snapshot exists, either because it never expired or
      // because another caller filled it while we queued on the lock.
      // `in_progress` — someone is calling X right now, so we serve whatever is
      // on the row rather than paying for a duplicate read.
      if (claim?.insights) {
        return json(req, {
          insights: claim.insights,
          cached: true,
          cached_at: claim.insights_cached_at ?? null,
        });
      }

      // `in_progress` with nothing cached yet: the first-ever read for this
      // account is in flight. Say so honestly rather than starting a second one.
      return json(
        req,
        {
          error: 'read_in_progress',
          message: 'Your X analytics are being loaded. Try again in a moment.',
        },
        503,
      );
    }

    releaseClaim = async () => {
      releaseClaim = null;
      // p_insights null => release without writing a snapshot.
      const { error } = await supabase.rpc('commit_x_insights_read', {
        p_user_id: user.id,
        p_claim_id: claim.claim_id,
      });
      if (error) console.error('[x-insights] could not release read claim:', error.message);
    };

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
    // has a current follower count without a second billed read. Claim-bound,
    // so a caller that stalled past the TTL cannot overwrite a newer snapshot.
    const { error: writeError } = await supabase.rpc('commit_x_insights_read', {
      p_user_id: user.id,
      p_claim_id: claim.claim_id,
      p_insights: insights,
      p_username: insights.account.username,
      p_display_name: insights.account.display_name,
      p_followers_count: insights.account.followers_count,
      p_following_count: insights.account.following_count,
      p_tweet_count: insights.account.tweet_count,
    });

    // The read already happened and was already billed, so failing the request
    // here would charge the user twice for one answer. Logged, not thrown — but
    // logged loudly, because a cache that silently never writes turns every
    // render into a paid read.
    if (writeError) {
      console.error('[x-insights] could not cache snapshot:', writeError.message);
    }
    // Spent, one way or the other — the commit above cleared it, and a failed
    // commit is not something a release would fix.
    releaseClaim = null;

    return json(req, { insights, cached: false, cached_at: new Date().toISOString() });
  } catch (err) {
    // Release a claim we still hold. Without this a failed read blocks the next
    // caller for the whole TTL — turning one transient error into a minute of
    // "being loaded" for a user who did nothing wrong.
    if (releaseClaim) await releaseClaim();

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
