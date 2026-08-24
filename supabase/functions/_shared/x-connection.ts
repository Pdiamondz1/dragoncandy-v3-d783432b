/**
 * Reading an X connection, and keeping its 2-hour access token alive.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS FILE EXISTS FOR
 *
 * X access tokens last two hours and the refresh token ROTATES — every refresh
 * returns a new one, and X does not document whether the old one dies on use.
 * Community reports say it does, so this is built as if it does, because the
 * failure if it does is unrecoverable: the connection cannot be renewed and the
 * user must re-consent.
 *
 * That turns a routine "refresh if expired" into a concurrency problem. Two
 * callers that both see an expired token and both refresh means one wins, one
 * gets `invalid_grant`, and — worse — a late write can put the DEAD token back
 * on the row. With a 2-hour lifetime and this card rendering on three settings
 * surfaces, that is a second browser tab, not a thought experiment.
 *
 * So the decision is made in SQL (`claim_x_token_refresh`), the exchange happens
 * here, and the result is written back through `commit_x_token_refresh`. The
 * claim/exchange/commit shape is the same one `pending_balance_flushes` uses for
 * the Stripe flush, and for the same reason: an advisory lock cannot be held
 * across an outbound HTTP call, so the thing being protected happens after the
 * lock is gone.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { refreshAccessToken, XError, XGrantInvalidError } from './x-api.ts';

export const TABLE = 'x_account_connections';

/** Columns safe to read for connection handling. Never `select *`. */
const CONNECTION_COLUMNS =
  'id, user_id, x_user_id, username, display_name, scopes, access_token, ' +
  'access_token_expires_at, refresh_token, insights, insights_cached_at, status, last_error, ' +
  'connected_at, last_synced_at';

export interface XConnection {
  id: string;
  user_id: string;
  x_user_id: string;
  username: string | null;
  display_name: string | null;
  scopes: string[];
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string | null;
  insights: unknown;
  insights_cached_at: string | null;
  status: string;
  last_error: string | null;
  connected_at: string;
  last_synced_at: string | null;
}

export async function loadConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<XConnection | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new XError('storage_failed', error.message, 500);
  return (data as XConnection | null) ?? null;
}

/**
 * How much remaining life still counts as usable.
 *
 * Kept in step with `claim_x_token_refresh`'s own default so the two cannot
 * disagree about what "expired" means — a caller that thinks a token is fine
 * while the RPC thinks it needs refreshing (or the reverse) produces either a
 * 401 mid-request or a refresh loop that never settles.
 */
export const REFRESH_SKEW_SECONDS = 120;

export function isFresh(expiresAt: string, skewSeconds = REFRESH_SKEW_SECONDS): boolean {
  const t = Date.parse(expiresAt);
  // An unparseable timestamp must read as STALE, never fresh. Fresh would send a
  // request with a token we cannot reason about and surface as a confusing 401;
  // stale costs one refresh.
  if (Number.isNaN(t)) return false;
  return t > Date.now() + skewSeconds * 1000;
}

export class XReconnectRequiredError extends XError {
  constructor(message: string) {
    super('needs_reconnect', message, 409);
    this.name = 'XReconnectRequiredError';
  }
}

/**
 * Mark a connection as needing the user to reconnect.
 *
 * Best-effort: the caller is already on an error path and a failure to record
 * the status must not replace the real error with a storage one. Logged, because
 * silently failing here is what leaves a card saying "Connected" over a dead
 * grant.
 */
export async function markNeedsReconnect(
  supabase: SupabaseClient,
  userId: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'needs_reconnect', last_error: message.slice(0, 500) })
    .eq('user_id', userId);
  if (error) {
    console.error('[x-connection] could not mark needs_reconnect:', error.message);
  }
}

/**
 * Return an access token good for the next request, refreshing if needed.
 *
 * Never calls X when someone else has already refreshed, which is the whole
 * point — a second call would spend a refresh token that may already be dead.
 */
export async function getUsableAccessToken(
  supabase: SupabaseClient,
  conn: XConnection,
  /**
   * Refresh even though the stored expiry still looks fine.
   *
   * For the case the expiry cannot see: X can revoke a token at any moment — a
   * user removing the app at x.com does exactly that — and the recorded expiry
   * goes on looking healthy for up to two hours afterwards. Without this the
   * connection is simply broken for that whole window, with no reconnect button
   * offered, because nothing has noticed anything is wrong.
   */
  opts: { force?: boolean } = {},
): Promise<string> {
  if (!opts.force && isFresh(conn.access_token_expires_at)) return conn.access_token;

  const { data: claim, error: claimError } = await supabase.rpc('claim_x_token_refresh', {
    p_user_id: conn.user_id,
    p_skew_seconds: REFRESH_SKEW_SECONDS,
    // IDENTITY, not an impossible threshold.
    //
    // The first version of this expressed force as a 30-day skew, so the RPC
    // could never answer `fresh` — a two-hour token cannot satisfy it. Two
    // concurrent 401s therefore refreshed SERIALLY: the second rotated away the
    // token the first had just minted, and the first then marked a healthy
    // connection `needs_reconnect`. Caught by the Codex review.
    //
    // Naming the rejected token asks the right question instead: "has anyone
    // already replaced the credential I was rejected on?" If yes, use theirs.
    p_rejected_access_token: opts.force ? conn.access_token : null,
  });

  if (claimError) throw new XError('storage_failed', claimError.message, 500);

  if (!claim?.claimed) {
    switch (claim?.reason) {
      case 'fresh':
      case 'in_progress': {
        // Someone else refreshed, or is refreshing right now. Re-read rather
        // than reusing our stale copy — and if it is still not fresh, say so
        // instead of calling X behind their back.
        //
        // Under `force` the RPC decides this by token identity, so `fresh` here
        // already means "someone replaced the credential you were rejected on".
        // The re-read still matters: the RPC tells us the row changed, not what
        // it changed to.
        const latest = await loadConnection(supabase, conn.user_id);
        if (opts.force && latest && latest.access_token !== conn.access_token) {
          return latest.access_token;
        }
        if (latest && isFresh(latest.access_token_expires_at) && !opts.force) {
          return latest.access_token;
        }
        throw new XError(
          'refresh_in_progress',
          'This connection is being refreshed. Please try again in a moment.',
          503,
        );
      }
      case 'no_refresh_token':
        throw new XReconnectRequiredError(
          'This X connection cannot be renewed because offline access was not granted. ' +
            'Reconnect to continue.',
        );
      case 'no_connection':
        throw new XError('not_connected', 'No X account is connected', 404);
      default:
        throw new XError('refresh_failed', 'Could not claim a token refresh', 500);
    }
  }

  try {
    const tokens = await refreshAccessToken(claim.refresh_token);

    const { data: commit, error: commitError } = await supabase.rpc('commit_x_token_refresh', {
      p_user_id: conn.user_id,
      // Bound to the claim that produced it. A commit whose claim has since been
      // taken over must write nothing — see the guard in the RPC.
      p_claim_id: claim.claim_id,
      p_access_token: tokens.access_token,
      p_access_token_expires_at: tokens.expires_at,
      p_refresh_token: tokens.refresh_token,
      p_scopes: tokens.scopes.length > 0 ? tokens.scopes : null,
    });

    // A refresh that succeeded at X but failed to store is the dangerous case:
    // the rotation already happened, so the token on the row is now the DEAD
    // one. Loud, and not swallowed — the next caller will find a stale row and
    // this log is the only record of why.
    if (commitError) {
      console.error('[x-connection] refresh stored nothing:', commitError.message);
      throw new XError(
        'storage_failed',
        'Refreshed the X connection but could not save it. Please try again.',
        500,
      );
    }

    if (commit?.reason === 'stale_claim') {
      // We stalled past the claim TTL and someone else refreshed meanwhile. Our
      // token pair is real but was minted from a refresh token they have since
      // rotated away, so it is the loser. Use the winner's — never our own,
      // which is exactly the write the RPC just refused.
      const latest = await loadConnection(supabase, conn.user_id);
      if (latest) return latest.access_token;
      throw new XError('not_connected', 'No X account is connected', 404);
    }

    return tokens.access_token;
  } catch (e) {
    const grantInvalid = e instanceof XGrantInvalidError;

    // Release the claim either way. Marking `needs_reconnect` only on a genuinely
    // dead grant is deliberate: a network blip must not burn down a connection
    // that is fine, and `commit_x_token_refresh` leaves status alone unless told.
    const { error: releaseError } = await supabase.rpc('commit_x_token_refresh', {
      p_user_id: conn.user_id,
      // Claim-bound too: a stalled worker releasing a claim it no longer holds
      // would hand a third caller the same race it just lost.
      p_claim_id: claim.claim_id,
      p_grant_invalid: grantInvalid,
      p_error: (e as Error).message.slice(0, 500),
    });
    if (releaseError) {
      console.error('[x-connection] could not release refresh claim:', releaseError.message);
    }

    if (grantInvalid) {
      throw new XReconnectRequiredError(
        'X has ended this connection. Reconnect your account to keep seeing analytics.',
      );
    }
    throw e;
  }
}

/**
 * How long a cached snapshot is served before X is asked again.
 *
 * This is a COST control, not a performance one. X bills per read (~$0.005 a
 * post read, ~$0.010 a user read), which is true of none of the other three
 * connectors — YouTube, Instagram and Facebook insights are free, so all three
 * read on every card render. Doing that here bills us per render, per surface,
 * per user, and this card appears on three surfaces.
 *
 * Fifteen minutes is chosen against what the data actually does: follower counts
 * and post metrics move over hours, so a fresher read buys no accuracy anyone
 * can perceive and costs real money.
 */
export const INSIGHTS_CACHE_SECONDS = 15 * 60;

export function isCacheUsable(
  cachedAt: string | null,
  maxAgeSeconds = INSIGHTS_CACHE_SECONDS,
): boolean {
  if (!cachedAt) return false;
  const t = Date.parse(cachedAt);
  // Same rule as `isFresh`, opposite default: an unreadable timestamp means we
  // cannot claim the cache is valid, so we pay for one read rather than serving
  // something we cannot date.
  if (Number.isNaN(t)) return false;
  return Date.now() - t < maxAgeSeconds * 1000;
}
