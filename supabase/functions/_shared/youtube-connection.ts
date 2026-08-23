/**
 * Loading a stored YouTube connection and keeping its access token fresh.
 *
 * This is the only module that reads `youtube_channel_connections`, and it does
 * so with the service role — the table has RLS enabled with NO policies, so
 * every scoping rule a policy would normally enforce lives in the `.eq('user_id',
 * …)` filters here. Never widen them.
 *
 * Tokens are never returned to a caller outside the backend.
 */

// deno-lint-ignore-file no-explicit-any

import { refreshAccessToken, YouTubeError } from './youtube.ts';

/** Supabase client, typed loosely so this module has no supabase-js dependency. */
type Db = any;

const TABLE = 'youtube_channel_connections';

/** Refresh this far before actual expiry, so a request never races the clock. */
const EXPIRY_SKEW_MS = 60 * 1000;

const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';

export interface StoredConnection {
  id: string;
  channel_id: string;
  channel_title: string | null;
  scopes: string[];
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  status: string;
}

const COLUMNS =
  'id, channel_id, channel_title, scopes, refresh_token, access_token, access_token_expires_at, status';

/**
 * Load one connection for a user.
 *
 * With no channelId, returns the oldest connection — deterministic, and the one
 * a single-channel user has. A caller that must be precise passes the id.
 */
export async function loadConnection(
  db: Db,
  userId: string,
  channelId?: string,
): Promise<StoredConnection | null> {
  let query = db.from(TABLE).select(COLUMNS).eq('user_id', userId);
  if (channelId) query = query.eq('channel_id', channelId);

  const { data, error } = await query.order('connected_at', { ascending: true }).limit(1);

  if (error) {
    console.error('[youtube-connection] load failed:', error);
    throw new YouTubeError('lookup_failed', 'Could not read the YouTube connection', 500);
  }
  return (data?.[0] as StoredConnection) ?? null;
}

export async function markNeedsReconnect(db: Db, id: string, reason: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ status: 'needs_reconnect', last_error: reason.slice(0, 500) })
    .eq('id', id);
  if (error) console.error('[youtube-connection] could not mark needs_reconnect:', error);
}

export async function markSynced(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[youtube-connection] could not stamp last_synced_at:', error);
}

/**
 * Do we POSITIVELY know the analytics scope was not granted?
 *
 * The asymmetry is deliberate. An empty `scopes` array means we never recorded
 * what was granted — not that nothing was — so it answers false and lets Google
 * judge. Failing closed on absent knowledge would break a working connection on
 * the strength of a gap in our own bookkeeping.
 *
 * Used at connect time (to store the right status immediately) and at read time
 * (to refuse before spending a Google call), so the two cannot disagree.
 */
export function isAnalyticsScopeMissing(scopes: string[]): boolean {
  return scopes.length > 0 && !scopes.includes(ANALYTICS_SCOPE);
}

/** Human-readable reason stored on a connection that lacks analytics access. */
export const MISSING_SCOPE_MESSAGE =
  'Analytics access was not granted — reconnect and allow all requested permissions';

export function requireAnalyticsScope(conn: StoredConnection): void {
  if (!isAnalyticsScopeMissing(conn.scopes)) return;
  throw new YouTubeError('missing_scope', MISSING_SCOPE_MESSAGE, 403);
}

/**
 * Return a usable access token, refreshing and persisting when the stored one
 * has expired.
 *
 * On `invalid_grant` the connection is marked `needs_reconnect` BEFORE the throw
 * propagates, so the state the user sees matches what actually happened rather
 * than waiting for someone to notice a failing read.
 *
 * Expect this to fire about 7 days after every connection while the Google Cloud
 * app sits in **Testing** publishing status — Google expires refresh tokens for
 * External + Testing apps on that schedule. That is a console setting, not a bug
 * here.
 */
export async function ensureAccessToken(db: Db, conn: StoredConnection): Promise<string> {
  const expiresAt = conn.access_token_expires_at
    ? Date.parse(conn.access_token_expires_at)
    : NaN;

  if (conn.access_token && Number.isFinite(expiresAt) && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return conn.access_token;
  }

  let tokens;
  try {
    tokens = await refreshAccessToken(conn.refresh_token);
  } catch (err) {
    if (err instanceof YouTubeError && err.code === 'needs_reconnect') {
      await markNeedsReconnect(db, conn.id, err.message);
    }
    throw err;
  }

  // `scopes` is deliberately NOT rewritten from the refresh response. The
  // consent screen is the authority on what was granted; a refresh response
  // echoing a list is not a new grant, and treating it as one would let a
  // formatting difference silently narrow what we believe we have.
  const { error } = await db
    .from(TABLE)
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: new Date(
        Date.now() + (tokens.expires_in ?? 3600) * 1000,
      ).toISOString(),
      status: 'active',
      last_error: null,
    })
    .eq('id', conn.id);

  // A failed write costs a redundant refresh next time, nothing more — the token
  // in hand is valid, so returning it is strictly better than failing the read.
  if (error) console.error('[youtube-connection] could not persist refreshed token:', error);

  return tokens.access_token;
}
