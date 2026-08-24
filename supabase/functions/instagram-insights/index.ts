// instagram-insights — reads daily account insights for the caller's connected
// Instagram account.
//
// READ-ONLY. Nothing here writes to Instagram.
//
// The honesty rules live in `_shared/instagram-insights.ts` and are the reason
// this function returns `days_with_data` alongside `requested_days`: Meta's data
// lags up to 48 hours, so a response echoing the requested window would be
// indistinguishable from a fabricated one.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INSTAGRAM_APP_SECRET
//      (the refresh path needs the secret; the read itself does not)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { InstagramError } from '../_shared/instagram.ts';
import {
  ensureFreshToken,
  loadConnection,
  markNeedsReconnect,
  markSynced,
  requireInsightsPermission,
} from '../_shared/instagram-connection.ts';
import { fetchDailyInsights, MAX_WINDOW_DAYS } from '../_shared/instagram-insights.ts';

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

    const body = await req.json().catch(() => ({}));
    const igUserId = typeof body?.ig_user_id === 'string' ? body.ig_user_id : undefined;
    const requestedDays = Number(body?.days);
    const days = Number.isFinite(requestedDays) ? requestedDays : MAX_WINDOW_DAYS;

    // The `.eq('user_id', …)` inside loadConnection IS the authorization.
    const conn = await loadConnection(supabase, user.id, igUserId);
    if (!conn) {
      return json(req, { error: 'not_connected', message: 'No Instagram account connected' }, 404);
    }

    // Refuse before spending a Meta call, using the same predicate the connect
    // path used to set the status — so the two cannot disagree.
    requireInsightsPermission(conn);

    // Extends the 60-day token when it is close to expiry. See
    // `instagram-connection.ts` for why this is proactive rather than
    // on-expiry: an expired Instagram token cannot be refreshed at all.
    const token = await ensureFreshToken(supabase, conn);

    let summary;
    try {
      summary = await fetchDailyInsights({
        igUserId: conn.ig_user_id,
        accessToken: token,
        days,
      });
    } catch (err) {
      // A token Meta rejects mid-read means the grant is gone. Record it so the
      // card shows Reconnect rather than continuing to claim "Connected" — the
      // stale-UI defect the YouTube connector had to fix in review.
      //
      // Note what is deliberately NOT treated this way: `rate_limited`. Meta
      // overloads its error surface the same way Google overloads 403, and
      // marking every throttled read as needing reauthorization would tell every
      // user on the platform to reconnect during one hour of rate limiting.
      if (err instanceof InstagramError && err.code === 'needs_reconnect') {
        await markNeedsReconnect(supabase, conn.id, err.message);
      }
      throw err;
    }

    await markSynced(supabase, conn.id);

    return json(req, {
      ig_user_id: conn.ig_user_id,
      username: conn.username,
      account_type: conn.account_type,
      followers_count: conn.followers_count,
      ...summary,
    });
  } catch (err) {
    if (err instanceof InstagramError) {
      console.error('[instagram-insights]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[instagram-insights] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not read Instagram insights' }, 500);
  }
});
