// instagram-refresh-sweep — keeps dormant Instagram connections alive.
//
// WHY THIS EXISTS AND THE YOUTUBE CONNECTOR HAS NO EQUIVALENT.
//
// Google's refresh token does not expire, so a YouTube connection nobody opens
// for a year still works the moment someone does. Instagram has no refresh
// token: the 60-day access token IS the credential, and Meta will only extend it
// while it is still valid. So an Instagram connection that nobody reads for 60
// days is not stale — it is DEAD, and the only recovery is the user consenting
// again.
//
// `instagram-connection.ts` refreshes on the read path, which covers every
// active user for free. This covers the rest, and the rest is exactly the
// population at risk: a restaurant that connected once, never opens Settings,
// and would find out only when someone finally looked at an empty chart.
//
// Two mechanisms rather than one because they fail differently — the read path
// depends on the user showing up, this depends on a cron actually running. With
// a 15-day window before expiry, this job has fifteen daily attempts to succeed
// before anything is lost, so several days of Meta or cron trouble cost nothing.
//
// Runs with `verify_jwt = false` (declared in `supabase/config.toml`) and checks
// the ingest bearer itself, the same shape as `auto-approve-content` and
// `reconcile-pending-flushes`. Scheduled daily at 04:00 UTC by migration
// 20260825110000 — the schedule is part of the feature, since a sweep that never
// runs protects exactly the population it was built for and nobody else.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIOS_INGEST_SECRET,
//      INSTAGRAM_APP_SECRET (unused by the refresh call itself, but present so a
//      misconfigured environment fails here rather than per-connection)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { InstagramError, refreshLongLivedToken } from '../_shared/instagram.ts';
import {
  decideRefresh,
  markNeedsReconnect,
  REFRESH_WHEN_REMAINING_MS,
  TABLE,
  type StoredConnection,
} from '../_shared/instagram-connection.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Bounded per run. A pathological backlog should take several runs rather than
 * one long request that times out having done an unknown fraction of the work —
 * and because the window is 15 days wide, "several runs" is free.
 */
const MAX_PER_RUN = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req: Request) => {
  if (!isAuthorizedIngest(req)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const cutoff = new Date(Date.now() + REFRESH_WHEN_REMAINING_MS).toISOString();

  // Only ACTIVE connections inside the refresh window. A `needs_reconnect` row
  // is deliberately skipped: its token is already rejected or lapsed, so a
  // refresh cannot succeed and retrying it daily would be a permanent source of
  // errors that means nothing. This matches the partial index on the table.
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, ig_user_id, username, account_type, followers_count, permissions, access_token, token_issued_at, token_expires_at, status')
    .eq('status', 'active')
    .lte('token_expires_at', cutoff)
    .order('token_expires_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error('[instagram-refresh-sweep] could not list connections:', error);
    return json({ error: 'list_failed' }, 500);
  }

  const connections = (data ?? []) as StoredConnection[];
  let refreshed = 0;
  let skippedTooYoung = 0;
  let expired = 0;
  let failed = 0;

  for (const conn of connections) {
    const decision = decideRefresh(conn);

    if (decision.action === 'use') continue;

    if (decision.action === 'too_young') {
      // Under 24 hours old, so Meta will refuse. Harmless — a token that young
      // has ~59 days left, and tomorrow's run will take it.
      skippedTooYoung++;
      continue;
    }

    if (decision.action === 'expired') {
      // Nothing here can fix this; only the user can. Recorded so the card shows
      // Reconnect rather than continuing to claim the connection is healthy.
      await markNeedsReconnect(
        supabase,
        conn.id,
        'The Instagram token expired before it could be refreshed — reconnect to restore analytics',
      );
      expired++;
      continue;
    }

    try {
      const token = await refreshLongLivedToken(conn.access_token);
      const now = Date.now();
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({
          access_token: token.access_token,
          token_issued_at: new Date(now).toISOString(),
          token_expires_at: new Date(now + token.expires_in * 1000).toISOString(),
          last_error: null,
        })
        .eq('id', conn.id);

      if (updateError) {
        // Loud, because this is the one failure that loses ground: Meta may have
        // superseded the old token, and the row still holds it.
        console.error(
          '[instagram-refresh-sweep] CRITICAL: refreshed token was not persisted:',
          conn.id,
          updateError,
        );
        failed++;
        continue;
      }
      refreshed++;
    } catch (err) {
      if (err instanceof InstagramError && err.code === 'needs_reconnect') {
        await markNeedsReconnect(supabase, conn.id, err.message);
        expired++;
        continue;
      }
      // Transient. The row keeps its still-valid token and tomorrow's run
      // retries — which is the whole point of a 15-day window.
      console.error('[instagram-refresh-sweep] refresh failed for', conn.id, err);
      failed++;
    }
  }

  const summary = {
    considered: connections.length,
    refreshed,
    skipped_too_young: skippedTooYoung,
    expired,
    failed,
    // Reported so a run that hit the cap is distinguishable from one that
    // simply had little to do. Without it, a permanent backlog looks like a
    // healthy sweep every single day.
    hit_cap: connections.length === MAX_PER_RUN,
  };

  console.log('[instagram-refresh-sweep]', JSON.stringify(summary));
  return json(summary);
});
