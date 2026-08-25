/**
 * Loading a TikTok connection and keeping its access token usable.
 *
 * Tokens never leave the backend. The UI reads `tiktok_connection_status()`,
 * which returns no token column at all.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  refreshAccessToken,
  TikTokError,
  TikTokReconnectRequiredError,
} from './tiktok-api.ts';

export const TABLE = 'tiktok_account_connections';

export interface TikTokConnection {
  user_id: string;
  open_id: string;
  display_name: string | null;
  username: string | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string | null;
  status: string;
  insights: unknown;
  insights_cached_at: string | null;
}

/**
 * How long a cached snapshot is served before a fresh read.
 *
 * FIFTEEN MINUTES FOR A DIFFERENT REASON THAN ON X. There it is a cost control —
 * X bills per read, and the cache lives in the schema so a client cannot opt out
 * of it. TikTok is free, so this is latency and rate-limit courtesy only. That is
 * why there is no claim around the fill and no floor under a manual refresh: a
 * duplicate read here wastes a few hundred milliseconds, not money.
 */
export const INSIGHTS_CACHE_SECONDS = 15 * 60;

/**
 * Refresh this far ahead of expiry.
 *
 * Five minutes, against X's two. TikTok's access token lives 24 hours, so a
 * wider margin costs nothing and covers a slow request that starts just inside
 * the window.
 */
export const REFRESH_SKEW_SECONDS = 300;

export function isFresh(expiresAt: string, skewSeconds = REFRESH_SKEW_SECONDS): boolean {
  const t = Date.parse(expiresAt);
  // An unparseable timestamp is NOT fresh. Written as an explicit NaN check
  // rather than relying on comparison semantics, because `NaN > x` is false and
  // would happen to give the right answer here — for the wrong reason, and only
  // until someone inverts the expression.
  if (Number.isNaN(t)) return false;
  return t > Date.now() + skewSeconds * 1000;
}

export function isCacheUsable(cachedAt: string | null, maxAgeSeconds = INSIGHTS_CACHE_SECONDS): boolean {
  if (!cachedAt) return false;
  const t = Date.parse(cachedAt);
  if (Number.isNaN(t)) return false;
  return t > Date.now() - maxAgeSeconds * 1000;
}

export async function loadConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<TikTokConnection | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'user_id, open_id, display_name, username, access_token, access_token_expires_at, ' +
        'refresh_token, refresh_token_expires_at, status, insights, insights_cached_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new TikTokError('storage_failed', `Could not read the connection: ${error.message}`, 500);
  }
  return (data as TikTokConnection | null) ?? null;
}

export async function markNeedsReconnect(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_tiktok_needs_reconnect', {
    p_user_id: userId,
    p_error: reason,
  });
  // Logged, not thrown. The caller is already on a failure path and about to
  // return a useful error; making that path fail differently because a bookkeeping
  // write failed would replace a clear message with a confusing one.
  if (error) console.error('[tiktok] could not mark needs_reconnect:', error.message);
}

/**
 * An access token the caller can actually use.
 *
 * Refreshes under a claim when needed. The claim exists because TIKTOK'S
 * REFRESH TOKEN ROTATES: two concurrent exchanges can leave us holding a token
 * TikTok has already superseded, and nothing but a user re-consent recovers from
 * that. It is a correctness lock, not a cost one — which is why the insights
 * read below has no equivalent.
 *
 * `force` is for a caller that just got a 401: it passes the token it was
 * rejected on, so the RPC can tell "nobody has refreshed yet" from "someone
 * already did while we were being rejected".
 */
export async function getUsableAccessToken(
  supabase: SupabaseClient,
  conn: TikTokConnection,
  opts: { force?: boolean } = {},
): Promise<string> {
  if (!opts.force && isFresh(conn.access_token_expires_at)) {
    return conn.access_token;
  }

  const { data: claim, error: claimError } = await supabase.rpc('claim_tiktok_token_refresh', {
    p_user_id: conn.user_id,
    p_skew_seconds: REFRESH_SKEW_SECONDS,
    p_claim_ttl_seconds: 60,
    p_rejected_access_token: opts.force ? conn.access_token : null,
  });

  if (claimError) {
    throw new TikTokError('storage_failed', `Could not claim a refresh: ${claimError.message}`, 500);
  }

  if (!claim?.claimed) {
    // Someone else refreshed, or it was already fresh. Either way there is a
    // usable token on the row and spending our rotating refresh token on a second
    // exchange would be actively harmful.
    if (typeof claim?.access_token === 'string' && claim.access_token !== '') {
      return claim.access_token;
    }
    if (claim?.reason === 'no_connection') {
      throw new TikTokError('not_connected', 'No TikTok account is connected', 404);
    }
    // `in_progress` with nothing usable on the row: another caller is mid-refresh.
    throw new TikTokError(
      'refresh_in_progress',
      'Reconnecting to TikTok. Try again in a moment.',
      503,
    );
  }

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
  if (!clientKey || !clientSecret) {
    // Release the claim before failing, or the next caller waits out the TTL for
    // a misconfiguration they cannot fix.
    await supabase.rpc('commit_tiktok_token_refresh', {
      p_user_id: conn.user_id,
      p_claim_id: claim.claim_id,
      p_error: 'TikTok is not configured',
    });
    throw new TikTokError('not_configured', 'TikTok is not configured', 503);
  }

  try {
    const tokens = await refreshAccessToken({
      clientKey,
      clientSecret,
      refreshToken: claim.refresh_token as string,
    });

    const { data: commit, error: commitError } = await supabase.rpc(
      'commit_tiktok_token_refresh',
      {
        p_user_id: conn.user_id,
        p_claim_id: claim.claim_id,
        p_access_token: tokens.access_token,
        p_access_token_expires_at: tokens.access_token_expires_at,
        p_refresh_token: tokens.refresh_token,
        p_refresh_token_expires_at: tokens.refresh_token_expires_at,
        p_scopes: tokens.scopes.length > 0 ? tokens.scopes : null,
      },
    );

    if (commitError) {
      throw new TikTokError('storage_failed', `Could not store the refresh: ${commitError.message}`, 500);
    }

    // A stale claim means the grant was replaced while we were refreshing — the
    // user reconnected, possibly to a different TikTok account. The token in hand
    // belongs to the OLD grant, so it must not be returned; the caller retries
    // and picks up the new one.
    if (commit?.committed === false) {
      throw new TikTokError(
        'connection_changed',
        'Your TikTok connection changed while we were refreshing it. Reloading now.',
        409,
      );
    }

    return tokens.access_token;
  } catch (e) {
    if (e instanceof TikTokReconnectRequiredError) {
      await supabase.rpc('commit_tiktok_token_refresh', {
        p_user_id: conn.user_id,
        p_claim_id: claim.claim_id,
        p_grant_invalid: true,
        p_error: e.message,
      });
      throw e;
    }

    // Any other failure: release the claim so the next caller can try, and let
    // the original error surface unchanged.
    if (!(e instanceof TikTokError) || e.code !== 'storage_failed') {
      await supabase.rpc('commit_tiktok_token_refresh', {
        p_user_id: conn.user_id,
        p_claim_id: claim.claim_id,
        p_error: e instanceof Error ? e.message : 'refresh failed',
      });
    }
    throw e;
  }
}
