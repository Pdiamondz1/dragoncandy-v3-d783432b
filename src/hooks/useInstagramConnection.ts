import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { messageFromInvokeError } from '@/lib/invokeError';

/**
 * Instagram account connections — read-only insights access.
 *
 * Publishing to Instagram stays with Outstand; this connection exists to supply
 * the analytics Outstand never shipped (founder decision 2026-08-23). Nothing
 * here can post — `instagram_business_content_publish` is not requested.
 *
 * Tokens never reach the browser. The only read path is the caller-scoped
 * `instagram_connection_status()` RPC, which takes no arguments (identity comes
 * from `auth.uid()`) and returns no token column — the underlying table has RLS
 * enabled with no policies at all, so a direct `.from()` select would return
 * nothing even if someone tried.
 */

/**
 * Where the browser should land after the Instagram round trip.
 *
 * Stashed in sessionStorage rather than relied on from the signed state, because
 * the state's copy only comes back on SUCCESS — a failed exchange still has to
 * put the user somewhere they can see the error, and that is the page they left
 * from. Same tab, so sessionStorage survives the trip.
 */
export const INSTAGRAM_RETURN_PATH_KEY = 'instagram_return_path';

export interface InstagramConnection {
  ig_user_id: string;
  username: string | null;
  account_type: string | null;
  followers_count: number | null;
  permissions: string[];
  status: 'active' | 'needs_reconnect';
  connected: boolean;
  needs_reconnect: boolean;
  connected_at: string;
  last_synced_at: string | null;
  /**
   * When the stored token lapses.
   *
   * Surfaced to the UI, unlike anything in the YouTube equivalent, because here
   * it is user-facing: an Instagram grant genuinely does end on a date (60 days,
   * extended automatically while the connection is in use), and a card that
   * cannot say when would leave a business to discover it from an empty chart.
   */
  token_expires_at: string | null;
}

export function useInstagramConnections() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['instagram-connections', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<InstagramConnection[]> => {
      // `as never` because the RPC postdates the generated types — the same
      // shape as `dre_my_standing` in useDcPoints.
      const { data, error } = await supabase.rpc('instagram_connection_status' as never);
      if (error) throw error;
      return (data ?? []) as unknown as InstagramConnection[];
    },
  });
}

/**
 * Starts the consent flow. Returns nothing useful — it leaves the page.
 *
 * `return_path` is where the browser lands after Instagram, and it is reduced to
 * a same-origin path on both sides (here it is only ever `window.location`'s own
 * path, but the edge function does not take the caller's word for that).
 */
export function useConnectInstagram() {
  return useMutation({
    mutationFn: async (returnPath?: string) => {
      const target = returnPath ?? `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem(INSTAGRAM_RETURN_PATH_KEY, target);

      const { data, error } = await supabase.functions.invoke<{ authorize_url?: string }>(
        'instagram-oauth-start',
        { body: { return_path: target } },
      );

      if (error) {
        throw new Error(
          await messageFromInvokeError(error, 'Could not start the Instagram connection'),
        );
      }
      if (!data?.authorize_url) {
        throw new Error('Could not start the Instagram connection');
      }

      // A full navigation, not a router push: the next stop is instagram.com.
      window.location.assign(data.authorize_url);
    },
  });
}

export interface DisconnectResult {
  disconnected?: boolean;
  already_absent?: boolean;
  /**
   * Whether Meta accepted the withdrawal.
   *
   * `unsupported` is the EXPECTED value and is not a failure: Meta documents no
   * revoke for the Instagram Login path. The card uses this to tell the user the
   * truth — that the account is unlinked here, and that clearing the
   * authorization on Instagram's side is something only they can do.
   */
  revoke_outcome?: 'revoked' | 'unsupported' | 'failed';
  revoked_at_instagram?: boolean;
}

export function useDisconnectInstagram() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (igUserId: string) => {
      const { data, error } = await supabase.functions.invoke<DisconnectResult>(
        'instagram-disconnect',
        { body: { ig_user_id: igUserId } },
      );

      if (error) {
        throw new Error(
          await messageFromInvokeError(error, 'Could not disconnect the account'),
        );
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-connections', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['instagram-insights', user?.id] });
    },
  });
}
