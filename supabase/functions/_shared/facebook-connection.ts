/**
 * Storage helpers for `facebook_page_connections`.
 *
 * Service-role only — the table has RLS enabled with zero policies and no client
 * grants, so these run in edge functions or not at all.
 *
 * DELIBERATELY MUCH SMALLER THAN `instagram-connection.ts`, and the absences are
 * the point. That module carries `REFRESH_WHEN_REMAINING_MS`, `MIN_TOKEN_AGE_MS`
 * and a proactive-refresh path because an Instagram token dies 60 days after
 * consent and takes the connection with it. A Facebook Page token does not
 * expire, so none of that machinery belongs here; adding it would guard a
 * failure that cannot happen and tell the next reader that it can.
 */

// deno-lint-ignore-file no-explicit-any

import { INSIGHTS_PERMISSIONS } from './facebook-pages.ts';

export const TABLE = 'facebook_page_connections';

export interface StoredConnection {
  id: string;
  user_id: string;
  fb_user_id: string;
  page_id: string;
  page_name: string | null;
  page_access_token: string;
  user_access_token: string;
  user_token_expires_at: string | null;
  permissions: string[];
  tasks: string[];
  status: string;
}

type Db = any;

export async function loadConnection(
  db: Db,
  userId: string,
  pageId: string,
): Promise<StoredConnection | null> {
  const { data, error } = await db
    .from(TABLE)
    .select(
      'id, user_id, fb_user_id, page_id, page_name, page_access_token, user_access_token, ' +
        'user_token_expires_at, permissions, tasks, status',
    )
    .eq('user_id', userId)
    .eq('page_id', pageId)
    // .maybeSingle(), never .single(): a missing row is an ordinary state here
    // (the user disconnected in another tab), not an exception.
    .maybeSingle();

  if (error) throw new Error(`Could not read the Facebook connection: ${error.message}`);
  return (data as StoredConnection) ?? null;
}

export async function listConnections(db: Db, userId: string): Promise<StoredConnection[]> {
  const { data, error } = await db
    .from(TABLE)
    .select(
      'id, user_id, fb_user_id, page_id, page_name, page_access_token, user_access_token, ' +
        'user_token_expires_at, permissions, tasks, status',
    )
    .eq('user_id', userId)
    .order('connected_at', { ascending: true });

  if (error) throw new Error(`Could not list Facebook connections: ${error.message}`);
  return (data as StoredConnection[]) ?? [];
}

/**
 * Mark a connection as needing the user to reconnect.
 *
 * Called ONLY for a genuine authorization failure. Rate limiting must never
 * reach here: the YouTube connector shipped a version where an HTTP 403 was
 * treated as revocation, and because Google returns 403 for quota too, one hour
 * over quota would have told every user on the platform to reauthorize. The
 * classification lives in `isAuthFailure` / `isRateLimited`, and this function
 * trusts its caller to have used them.
 */
export async function markNeedsReconnect(db: Db, id: string, reason: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ status: 'needs_reconnect', last_error: reason })
    .eq('id', id);
  if (error) console.error('[facebook-connection] could not mark needs_reconnect:', error.message);
}

/**
 * Stamp a successful read.
 *
 * Also clears `last_error` and restores `active`, so a connection that recovers
 * on its own stops telling the user to reconnect. A stale error is a instruction
 * to do unnecessary work.
 */
export async function markSynced(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ last_synced_at: new Date().toISOString(), status: 'active', last_error: null })
    .eq('id', id);
  if (error) console.error('[facebook-connection] could not mark synced:', error.message);
}

/**
 * Can this connection still revoke its own grant?
 *
 * The awkward asymmetry this connector has to live with: the Page token that
 * reads insights never expires, while the USER token that revokes the grant
 * lasts about 60 days. So a connection can be perfectly healthy for reading and
 * simultaneously unable to hand its grant back.
 *
 * Disconnect uses this to say which of those happened rather than reporting a
 * generic failure. Nothing else should read it — in particular it is NOT a
 * health signal, and marking a connection stale from it would be wrong.
 */
export function canRevoke(conn: Pick<StoredConnection, 'user_token_expires_at'>): boolean {
  if (!conn.user_token_expires_at) return true; // no expiry recorded => assume usable
  const at = Date.parse(conn.user_token_expires_at);
  if (!Number.isFinite(at)) return true;
  return at > Date.now();
}

export const INSIGHTS_TASK = 'ANALYZE';

/**
 * Can this connection actually serve insights?
 *
 * TWO independent gates, and an earlier version checked only the first — which
 * meant a user who unticked `read_insights` on Meta's consent screen got a Page
 * stored as `active`, a card reading "Connected", and a failure on the very
 * first read (Codex, round 2).
 *
 *  - The PAGE TASK: Meta requires a token from someone who can ANALYZE the Page.
 *    A user can hold a Page role without it.
 *  - The GRANTED PERMISSIONS: read back from Meta at connect time precisely so
 *    we would not claim something we do not hold. Reading them and then not
 *    using them was worse than not reading them, because the row looked checked.
 */
export function canReadInsights(conn: Pick<StoredConnection, 'tasks' | 'permissions'>): boolean {
  const tasks = Array.isArray(conn.tasks) ? conn.tasks : [];
  const permissions = Array.isArray(conn.permissions) ? conn.permissions : [];
  return (
    tasks.includes(INSIGHTS_TASK) &&
    INSIGHTS_PERMISSIONS.every((p) => permissions.includes(p))
  );
}

/** Which gate failed. The two need different things from the user. */
export function missingInsightsReason(
  conn: Pick<StoredConnection, 'tasks' | 'permissions'>,
): 'task' | 'permission' | null {
  const permissions = Array.isArray(conn.permissions) ? conn.permissions : [];
  if (!INSIGHTS_PERMISSIONS.every((p) => permissions.includes(p))) return 'permission';
  const tasks = Array.isArray(conn.tasks) ? conn.tasks : [];
  if (!tasks.includes(INSIGHTS_TASK)) return 'task';
  return null;
}

export const MISSING_TASK_MESSAGE =
  'This Facebook Page did not grant analytics access. Reconnect and make sure the ' +
  'account you use has the Analyze permission on the Page.';

export const MISSING_PERMISSION_MESSAGE =
  'Analytics access was not granted for this Page. Reconnect and leave every permission ' +
  'ticked on the Facebook screen.';

/**
 * How many stored Pages share this Facebook grant.
 *
 * Load-bearing for disconnect, and the scope is the subtle part: this counts by
 * `fb_user_id` ACROSS DragonCandy accounts, not within one. The grant belongs to
 * a (Facebook user, app) pair, so `DELETE /me/permissions` invalidates every Page
 * token minted from it — including rows belonging to a different DragonCandy user
 * who linked the same Facebook account. Scoping this count to `user_id` would
 * miss exactly those rows and revoke a grant still in use.
 */
export async function countConnectionsForFacebookUser(
  db: Db,
  fbUserId: string,
): Promise<number> {
  const { count, error } = await db
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('fb_user_id', fbUserId);

  if (error) throw new Error(`Could not count Facebook connections: ${error.message}`);
  return count ?? 0;
}
