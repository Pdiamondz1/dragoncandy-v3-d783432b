import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { messageFromInvokeError } from '@/lib/invokeError';

/**
 * X (Twitter) connection — read-only analytics access.
 *
 * Publishing stays with Outstand; this exists to supply the analytics Outstand
 * never shipped (founder decision 2026-08-23). Nothing here can post — only
 * `tweet.read`, `users.read` and `offline.access` are requested.
 *
 * Tokens never reach the browser. The only read path is the caller-scoped
 * `x_connection_status()` RPC, which takes no arguments (identity comes from
 * `auth.uid()`) and returns no token column — the underlying table has RLS
 * enabled with no policies at all, so a direct `.from()` select returns nothing
 * even if someone tries.
 *
 * SINGULAR, where the Facebook hook is plural. One X consent yields one
 * account, so this is a single connection like Instagram's and YouTube's rather
 * than Facebook's list of Pages.
 */

/**
 * Where the browser should land after the X round trip.
 *
 * Stashed in sessionStorage rather than taken from the signed state, because
 * the state's copy only comes back on SUCCESS — a failed exchange still has to
 * put the user somewhere they can read the error, and that is the page they
 * left.
 */
export const X_RETURN_PATH_KEY = 'x_return_path';

export interface XConnection {
  x_user_id: string;
  username: string | null;
  display_name: string | null;
  followers_count: number | null;
  following_count: number | null;
  tweet_count: number | null;
  scopes: string[];
  status: 'active' | 'needs_reconnect' | 'revoked';
  last_error: string | null;
  connected_at: string;
  last_synced_at: string | null;
  /**
   * Whether this connection can outlive its current two-hour access token.
   *
   * X issues a refresh token only when `offline.access` is granted, and a user
   * can decline it. Derived server-side from whether we actually hold one —
   * never a stored boolean, which could be set optimistically.
   *
   * A connection with `can_refresh: false` is real and usable, and it dies in
   * two hours. The card says so rather than letting a business discover it from
   * a card that silently stops updating.
   */
  can_refresh: boolean;
}

/**
 * Deliberately NO token-expiry field, and for the opposite reason to Facebook's.
 *
 * Facebook omits one because a Page token genuinely never expires. Here the
 * access token expires every two hours — far too often to be worth showing, and
 * showing it would invite a UI that warns about a deadline the refresh handles
 * automatically. `can_refresh` is the honest signal: it answers "will this keep
 * working", which is the question a user actually has.
 */
export function useXConnection() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['x-connection', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<XConnection | null> => {
      // `as never` because the RPC postdates the generated types — the same
      // shape as `dre_my_standing` in useDcPoints.
      const { data, error } = await supabase.rpc('x_connection_status' as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as XConnection[];
      // The RPC returns a set; one X account per user, so at most one row. An
      // empty set is "not connected", which is a state and not an error.
      return rows[0] ?? null;
    },
  });
}

/** Starts the consent flow. Returns nothing useful — it leaves the page. */
export function useConnectX() {
  return useMutation({
    mutationFn: async (returnPath?: string) => {
      const target = returnPath ?? `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem(X_RETURN_PATH_KEY, target);

      const { data, error } = await supabase.functions.invoke<{ authorize_url?: string }>(
        'x-oauth-start',
        { body: { return_path: target } },
      );

      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not start the X connection'));
      }
      if (!data?.authorize_url) {
        throw new Error('Could not start the X connection');
      }

      // A full navigation, not a router push: the next stop is x.com.
      window.location.assign(data.authorize_url);
    },
  });
}

export interface XDisconnectResult {
  disconnected?: boolean;
  /**
   * What happened to the grant on X's side.
   *
   * - `revoked` — X accepted the withdrawal. The normal case.
   * - `already_invalid` — the grant was gone before we asked. Also fine.
   * - `already_gone` — we had no row. Idempotent, not an error.
   *
   * There is no `expired` case as there is for Facebook: revoking an X access
   * token invalidates the whole grant, and an expired access token still
   * identifies that grant, so the call is made either way.
   */
  revoked?: 'revoked' | 'already_invalid' | 'already_gone';
  message?: string;
}

export function useDisconnectX() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<XDisconnectResult>('x-disconnect', {
        body: {},
      });

      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not disconnect X'));
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['x-insights', user?.id] });
    },
  });
}
