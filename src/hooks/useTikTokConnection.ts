import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { messageFromInvokeError } from '@/lib/invokeError';

/**
 * TikTok connection — read-only analytics access.
 *
 * Publishing stays with Outstand; this exists to supply the analytics Outstand
 * never shipped (founder decision 2026-08-23). Nothing here can post — the
 * Content Posting API is not requested and the scopes are profile, stats and a
 * video list.
 *
 * Tokens never reach the browser. The only read path is the caller-scoped
 * `tiktok_connection_status()` RPC, which takes no arguments (identity comes
 * from `auth.uid()`) and returns no token column — the underlying table has RLS
 * enabled with no policies at all.
 *
 * SINGULAR, like X's and Instagram's. One TikTok consent yields one account;
 * Facebook is the odd one out with many Pages per grant.
 */

/**
 * Where the browser should land after the TikTok round trip.
 *
 * Stashed in sessionStorage rather than taken from the signed state, because the
 * state's copy only comes back on SUCCESS — a failed exchange still has to put
 * the user somewhere they can read the error, and that is the page they left.
 */
export const TIKTOK_RETURN_PATH_KEY = 'tiktok_return_path';

export interface TikTokConnection {
  open_id: string;
  display_name: string | null;
  /**
   * The @handle. Requires the `user.info.profile` scope, which is requested for
   * this field alone — `display_name` comes with the basic scope but display
   * names are not unique, and this card's job is answering WHICH account is
   * linked.
   */
  username: string | null;
  avatar_url: string | null;
  profile_deep_link: string | null;
  follower_count: number | null;
  following_count: number | null;
  likes_count: number | null;
  video_count: number | null;
  scopes: string[];
  status: 'active' | 'needs_reconnect' | 'revoked';
  last_error: string | null;
  connected_at: string;
  last_synced_at: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string | null;
}

export function useTikTokConnection() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tiktok-connection', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TikTokConnection | null> => {
      // `as never` because the RPC postdates the generated types — the same
      // shape as `dre_my_standing` in useDcPoints.
      const { data, error } = await supabase.rpc('tiktok_connection_status' as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as TikTokConnection[];
      // The RPC returns a set; one TikTok account per user, so at most one row.
      // An empty set is "not connected", which is a state and not an error.
      return rows[0] ?? null;
    },
  });
}

/** Starts the consent flow. Returns nothing useful — it leaves the page. */
export function useConnectTikTok() {
  return useMutation({
    mutationFn: async (returnPath?: string) => {
      const target = returnPath ?? `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem(TIKTOK_RETURN_PATH_KEY, target);

      const { data, error } = await supabase.functions.invoke<{ authorize_url?: string }>(
        'tiktok-oauth-start',
        { body: { return_path: target } },
      );

      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not start the TikTok connect'));
      }
      if (!data?.authorize_url) {
        throw new Error('Could not start the TikTok connect');
      }

      window.location.href = data.authorize_url;
    },
  });
}

export function useDisconnectTikTok() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ disconnected?: boolean }>(
        'tiktok-disconnect',
        { body: {} },
      );

      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not disconnect TikTok'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tiktok-connection', user?.id] });
      // Prefix match: the account segment varies and after a disconnect any
      // cached figures describe an account we no longer hold.
      void queryClient.invalidateQueries({ queryKey: ['tiktok-insights', user?.id] });
    },
  });
}
