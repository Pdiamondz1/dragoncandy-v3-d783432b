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

export const TABLE = 'facebook_page_connections';

export interface StoredConnection {
  id: string;
  user_id: string;
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
      'id, user_id, page_id, page_name, page_access_token, user_access_token, ' +
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
      'id, user_id, page_id, page_name, page_access_token, user_access_token, ' +
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

export function canReadInsights(conn: Pick<StoredConnection, 'tasks'>): boolean {
  return Array.isArray(conn.tasks) && conn.tasks.includes(INSIGHTS_TASK);
}

export const MISSING_TASK_MESSAGE =
  'This Facebook Page did not grant analytics access. Reconnect and make sure the ' +
  'account you use has the Analyze permission on the Page.';
