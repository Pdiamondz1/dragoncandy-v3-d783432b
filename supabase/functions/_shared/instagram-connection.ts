/**
 * Loading a stored Instagram connection and keeping its token alive.
 *
 * This is the only module that reads `instagram_account_connections`, and it
 * does so with the service role — the table has RLS enabled with NO policies, so
 * every scoping rule a policy would normally enforce lives in the
 * `.eq('user_id', …)` filters here. Never widen them.
 *
 * Tokens are never returned to a caller outside the backend.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `youtube-connection.ts` WITH THE NAMES CHANGED
 *
 * `youtube-connection.ts` refreshes ON EXPIRY, which is correct for Google: the
 * refresh token does not expire, so an access token that has already lapsed is
 * still recoverable at any later moment.
 *
 * Instagram has no refresh token. The 60-day access token IS the credential, and
 * `ig_refresh_token` extends that same credential — which Meta will only do
 * while it is **still valid**. Refresh-on-expiry is therefore not merely
 * suboptimal here, it is guaranteed to fail: by the time the token has expired,
 * the only thing that can restore the connection is the user re-consenting.
 *
 * So this module refreshes PROACTIVELY, and a scheduled sweep exists for
 * connections nobody opens. Two mechanisms rather than one because they fail
 * differently: the read path covers active users at no extra cost, the sweep
 * covers the dormant account that is exactly the one at risk.
 * ---------------------------------------------------------------------------
 */

// deno-lint-ignore-file no-explicit-any

import {
  InstagramError,
  INSIGHTS_PERMISSION,
  refreshLongLivedToken,
} from './instagram.ts';

/** Supabase client, typed loosely so this module has no supabase-js dependency. */
type Db = any;

export const TABLE = 'instagram_account_connections';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refresh once the token has less than this long to live.
 *
 * 15 days of a 60-day life. Wide enough that a user who opens the page once a
 * fortnight never sees a broken connection, and wide enough that the sweep has
 * fifteen daily attempts to succeed before anything is lost — so a few days of
 * Meta being unavailable costs nothing.
 */
export const REFRESH_WHEN_REMAINING_MS = 15 * DAY_MS;

/**
 * Meta refuses to refresh a token younger than 24 hours.
 *
 * Named as a constant because it is a provider rule, not a tuning choice: a
 * connector that ignores it turns every fresh connection's first read into a
 * failed refresh, and the error Meta returns for "too young" is the same shape
 * as the one for "invalid".
 */
export const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredConnection {
  id: string;
  ig_user_id: string;
  username: string | null;
  account_type: string | null;
  followers_count: number | null;
  permissions: string[];
  access_token: string;
  token_issued_at: string | null;
  token_expires_at: string | null;
  status: string;
}

const COLUMNS =
  'id, ig_user_id, username, account_type, followers_count, permissions, access_token, token_issued_at, token_expires_at, status';

/**
 * Load one connection for a user.
 *
 * With no igUserId, returns the oldest connection — deterministic, and the one a
 * single-account user has. A caller that must be precise passes the id.
 */
export async function loadConnection(
  db: Db,
  userId: string,
  igUserId?: string,
): Promise<StoredConnection | null> {
  let query = db.from(TABLE).select(COLUMNS).eq('user_id', userId);
  if (igUserId) query = query.eq('ig_user_id', igUserId);

  const { data, error } = await query.order('connected_at', { ascending: true }).limit(1);

  if (error) {
    console.error('[instagram-connection] load failed:', error);
    throw new InstagramError('lookup_failed', 'Could not read the Instagram connection', 500);
  }
  return (data?.[0] as StoredConnection) ?? null;
}

export async function markNeedsReconnect(db: Db, id: string, reason: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ status: 'needs_reconnect', last_error: reason.slice(0, 500) })
    .eq('id', id);
  if (error) console.error('[instagram-connection] could not mark needs_reconnect:', error);
}

export async function markSynced(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[instagram-connection] could not stamp last_synced_at:', error);
}

/**
 * Do we POSITIVELY know the insights permission was not granted?
 *
 * The asymmetry is deliberate and copied from the YouTube connector, where it
 * was the right call for the same reason: an empty `permissions` array means we
 * never recorded what was granted — not that nothing was — so it answers false
 * and lets Meta judge. Failing closed on absent knowledge would break a working
 * connection on the strength of a gap in our own bookkeeping.
 */
export function isInsightsPermissionMissing(permissions: string[]): boolean {
  return permissions.length > 0 && !permissions.includes(INSIGHTS_PERMISSION);
}

export const MISSING_PERMISSION_MESSAGE =
  'Insights access was not granted — reconnect and allow all requested permissions';

export function requireInsightsPermission(conn: StoredConnection): void {
  if (!isInsightsPermissionMissing(conn.permissions)) return;
  throw new InstagramError('missing_permission', MISSING_PERMISSION_MESSAGE, 403);
}

export type RefreshDecision =
  | { action: 'use' }
  | { action: 'refresh' }
  | { action: 'expired' }
  /** Needs refreshing but Meta will refuse — under 24h old. Harmless: it has ~59 days left. */
  | { action: 'too_young' };

/**
 * Decide what to do with a stored token, as a pure function.
 *
 * Split out from the I/O so the window arithmetic is testable without a database
 * or a network. Every branch here is a real state a production row reaches, and
 * two of them (`expired`, `too_young`) are states that only appear on a clock
 * nobody can advance in a test otherwise.
 */
export function decideRefresh(
  conn: Pick<StoredConnection, 'token_expires_at' | 'token_issued_at'>,
  now = Date.now(),
): RefreshDecision {
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : NaN;

  // An unknown expiry is treated as "refresh if allowed" rather than "use".
  // Being wrong the other way spends one API call; being wrong this way loses
  // the connection.
  if (!Number.isFinite(expiresAt)) {
    return ageAllowsRefresh(conn, now) ? { action: 'refresh' } : { action: 'too_young' };
  }

  if (expiresAt <= now) return { action: 'expired' };
  if (expiresAt - now > REFRESH_WHEN_REMAINING_MS) return { action: 'use' };

  return ageAllowsRefresh(conn, now) ? { action: 'refresh' } : { action: 'too_young' };
}

function ageAllowsRefresh(
  conn: Pick<StoredConnection, 'token_issued_at'>,
  now: number,
): boolean {
  const issuedAt = conn.token_issued_at ? Date.parse(conn.token_issued_at) : NaN;
  // Unknown issue date: assume old enough. A token whose issue date we lost is
  // far more likely to be old than to be minutes old, and the cost of being
  // wrong is one rejected call.
  if (!Number.isFinite(issuedAt)) return true;
  return now - issuedAt >= MIN_TOKEN_AGE_MS;
}

/**
 * Return a usable access token, extending it when it is close to expiry.
 *
 * On a terminal rejection the connection is marked `needs_reconnect` BEFORE the
 * throw propagates, so the state the user sees matches what actually happened
 * rather than waiting for someone to notice a failing read.
 */
export async function ensureFreshToken(db: Db, conn: StoredConnection): Promise<string> {
  const decision = decideRefresh(conn);

  if (decision.action === 'expired') {
    await markNeedsReconnect(
      db,
      conn.id,
      'The Instagram token expired before it could be refreshed — reconnect to restore analytics',
    );
    throw new InstagramError(
      'needs_reconnect',
      'The Instagram connection expired — reconnect to restore analytics',
      401,
    );
  }

  // `use` and `too_young` both mean "the token in hand is the right one to use".
  // They are separate values because only one of them is worth logging.
  if (decision.action !== 'refresh') return conn.access_token;

  let refreshed;
  try {
    refreshed = await refreshLongLivedToken(conn.access_token);
  } catch (err) {
    if (err instanceof InstagramError && err.code === 'needs_reconnect') {
      await markNeedsReconnect(db, conn.id, err.message);
      throw err;
    }
    // A transient refresh failure must NOT fail the read. The stored token is
    // still valid — that is the whole premise of refreshing early — so the
    // caller gets it and the next attempt tries again.
    console.error('[instagram-connection] refresh failed, using existing token:', err);
    return conn.access_token;
  }

  const now = Date.now();
  const { error } = await db
    .from(TABLE)
    .update({
      access_token: refreshed.access_token,
      token_issued_at: new Date(now).toISOString(),
      token_expires_at: new Date(now + refreshed.expires_in * 1000).toISOString(),
      status: 'active',
      last_error: null,
    })
    .eq('id', conn.id);

  // `permissions` is deliberately NOT rewritten here. The consent screen is the
  // authority on what was granted; a refresh response is not a new grant, and
  // treating it as one would let a formatting difference silently narrow what we
  // believe we hold.
  if (error) {
    // This one genuinely matters, unlike its YouTube counterpart. There, a lost
    // write costs a redundant refresh. Here the OLD token is the one still in
    // the row, and Meta may already have superseded it — so the connection can
    // be left holding a credential that no longer works, with no error anywhere
    // except this line.
    console.error(
      '[instagram-connection] CRITICAL: refreshed token was not persisted:',
      error,
    );
  }

  return refreshed.access_token;
}
