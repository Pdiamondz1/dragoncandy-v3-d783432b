import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { messageFromInvokeError } from '@/lib/invokeError';

/**
 * Facebook Page connections — read-only insights access.
 *
 * Publishing stays with Outstand; this exists to supply the analytics Outstand
 * never shipped (founder decision 2026-08-23). Nothing here can post — only
 * `pages_show_list`, `pages_read_engagement` and `read_insights` are requested.
 *
 * Tokens never reach the browser. The only read path is the caller-scoped
 * `facebook_connection_status()` RPC, which takes no arguments (identity comes
 * from `auth.uid()`) and returns no token column — the underlying table has RLS
 * enabled with no policies at all, so a direct `.from()` select returns nothing
 * even if someone tries.
 *
 * PLURAL WHERE INSTAGRAM IS SINGULAR. One Facebook consent can return several
 * Pages, so every hook here is list-shaped and each Page is connected and
 * disconnected independently.
 */

/**
 * Where the browser should land after the Facebook round trip.
 *
 * Stashed in sessionStorage rather than taken from the signed state, because the
 * state's copy only comes back on SUCCESS — a failed exchange still has to put
 * the user somewhere they can read the error, and that is the page they left.
 */
export const FACEBOOK_RETURN_PATH_KEY = 'facebook_return_path';

export interface FacebookPageConnection {
  page_id: string;
  page_name: string | null;
  category: string | null;
  followers_count: number | null;
  permissions: string[];
  tasks: string[];
  status: 'active' | 'needs_reconnect' | 'revoked';
  last_error: string | null;
  connected_at: string;
  last_synced_at: string | null;
  /**
   * Whether this Page can actually serve insights.
   *
   * Derived server-side from the ANALYZE Page task. A user can hold a Page role
   * that does not include it — an advertiser, say — and that Page authorizes and
   * stores perfectly well before failing every insights read with an error
   * naming nothing useful. Surfacing it here lets the card say so up front.
   */
  can_read_insights: boolean;
}

/**
 * Deliberately NO token-expiry field, unlike the Instagram hook.
 *
 * That one exposes `token_expires_at` because an Instagram grant genuinely ends
 * on a date and a business would otherwise discover it from an empty chart. A
 * Facebook Page token minted from a long-lived user token does not expire, so
 * there is no date to show — and showing one would invite a UI that warns about
 * a deadline that does not exist.
 */
export function useFacebookConnections() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['facebook-connections', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<FacebookPageConnection[]> => {
      // `as never` because the RPC postdates the generated types — the same
      // shape as `dre_my_standing` in useDcPoints.
      const { data, error } = await supabase.rpc('facebook_connection_status' as never);
      if (error) throw error;
      return (data ?? []) as unknown as FacebookPageConnection[];
    },
  });
}

/** Starts the consent flow. Returns nothing useful — it leaves the page. */
export function useConnectFacebook() {
  return useMutation({
    mutationFn: async (returnPath?: string) => {
      const target = returnPath ?? `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem(FACEBOOK_RETURN_PATH_KEY, target);

      const { data, error } = await supabase.functions.invoke<{ authorize_url?: string }>(
        'facebook-oauth-start',
        { body: { return_path: target } },
      );

      if (error) {
        throw new Error(
          await messageFromInvokeError(error, 'Could not start the Facebook connection'),
        );
      }
      if (!data?.authorize_url) {
        throw new Error('Could not start the Facebook connection');
      }

      // A full navigation, not a router push: the next stop is facebook.com.
      window.location.assign(data.authorize_url);
    },
  });
}

export interface FacebookDisconnectResult {
  disconnected?: boolean;
  /**
   * What happened to the grant on Meta's side.
   *
   * - `revoked` — Meta accepted the withdrawal. The normal case.
   * - `already_invalid` — the grant was gone before we asked. Also fine.
   * - `already_gone` — we had no row. Idempotent, not an error.
   * - `expired` — we could not tell Meta, because the USER token that revokes
   *   lasts ~60 days while the Page token that reads never expires. The card
   *   must say this plainly rather than implying the grant is gone.
   */
  revoked?: 'revoked' | 'already_invalid' | 'already_gone' | 'expired';
  message?: string;
}

export function useDisconnectFacebookPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const { data, error } = await supabase.functions.invoke<FacebookDisconnectResult>(
        'facebook-disconnect',
        { body: { page_id: pageId } },
      );

      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not disconnect the Page'));
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-connections', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['facebook-insights', user?.id] });
    },
  });
}
