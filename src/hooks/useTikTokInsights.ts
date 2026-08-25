import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { codeFromInvokeError, messageFromInvokeError } from '@/lib/invokeError';

/**
 * Read-only TikTok metrics.
 *
 * Every number here is nullable and the card renders a null as "—". A metric
 * TikTok did not return is ABSENT, never zero: the two look identical on a
 * dashboard and mean opposite things, and only one of them is ours to assert.
 * See [[Honest Analytics]].
 *
 * `videos_counted` and `has_more` are the fields to read before believing the
 * totals. TikTok caps a page at 20 videos, so the totals describe a RECENT PAGE
 * rather than an account lifetime, and the card says so rather than implying
 * completeness.
 *
 * THE SERVER CACHES, BUT NOT FOR THE REASON X DOES. X bills per read, so its
 * cache is a cost control with a claim around the fill and a floor under the
 * refresh button. TikTok's Display API is free; this cache is latency and
 * rate-limit courtesy, which is why a manual refresh here is honoured
 * immediately rather than throttled.
 */

/**
 * The code meaning the SERVER has just set the connection to `needs_reconnect`.
 *
 * `rate_limited` is deliberately absent, as in every sibling hook: telling a
 * user to reauthorize because TikTok is throttling them is the defect the
 * YouTube connector shipped with quota 403s. Being rate limited is not being
 * revoked.
 */
const RECONNECT_CODES = new Set(['needs_reconnect']);

/**
 * The connection changed underneath a read, so our cached view of BOTH queries
 * describes something that no longer exists.
 *
 * Nothing is broken and the user has nothing to fix: they reconnected — possibly
 * to a different TikTok account — while a read was in flight, and the server
 * correctly threw away figures belonging to the previous account rather than
 * showing them under the new one. Fetch again; do not show an error.
 */
const CHANGED_CODES = new Set(['connection_changed']);

export interface TikTokVideoMetrics {
  id: string;
  created_at: string | null;
  title: string | null;
  duration: number | null;
  cover_image_url: string | null;
  share_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface TikTokInsights {
  account: {
    open_id: string;
    union_id: string | null;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    profile_deep_link: string | null;
    follower_count: number | null;
    following_count: number | null;
    likes_count: number | null;
    video_count: number | null;
  };
  videos_counted: number;
  has_more: boolean;
  totals: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  };
  top_videos: TikTokVideoMetrics[];
  fetched_at: string;
}

export interface TikTokInsightsResponse {
  insights: TikTokInsights;
  cached: boolean;
  cached_at: string | null;
}

export function useTikTokInsights(openId: string | undefined, opts: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    // The account segment is part of the key so a reconnect to a DIFFERENT
    // TikTok account cannot serve the previous account's figures from cache.
    queryKey: ['tiktok-insights', user?.id, openId],
    enabled: !!user?.id && !!openId && opts.enabled !== false,
    queryFn: async (): Promise<TikTokInsightsResponse> => {
      const { data, error } = await supabase.functions.invoke<TikTokInsightsResponse>(
        'tiktok-insights',
        { body: {} },
      );

      if (error) {
        // Read the CODE before the message: the server has already written
        // `needs_reconnect` to the row, so the connection query must refetch or
        // the card keeps saying "Connected" while hiding the Reconnect button
        // behind an error the user cannot act on.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['tiktok-connection', user?.id] });
        }
        if (CHANGED_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['tiktok-connection', user?.id] });
          // Prefix match: after a change we do not know which account segment is
          // stale, only that any of them may be.
          void queryClient.invalidateQueries({ queryKey: ['tiktok-insights', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not read TikTok analytics'));
      }
      if (!data) throw new Error('Could not read TikTok analytics');
      return data;
    },
  });
}

/**
 * Ask the server for a fresh read.
 *
 * Unlike X's equivalent there is no floor under this: TikTok reads are free, so
 * a user who presses refresh twice costs nothing but a little latency. Naming it
 * `force` anyway keeps the two connectors' shapes comparable.
 */
export function useRefreshTikTokInsights(openId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<TikTokInsightsResponse> => {
      const { data, error } = await supabase.functions.invoke<TikTokInsightsResponse>(
        'tiktok-insights',
        { body: { force: true } },
      );
      if (error) {
        // The SAME code handling as the query above, and it has to be here too.
        // A forced refresh is the most likely place to discover a dead grant —
        // it is what a user presses when the numbers look wrong.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code) || CHANGED_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['tiktok-connection', user?.id] });
        }
        if (CHANGED_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['tiktok-insights', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not refresh TikTok analytics'));
      }
      if (!data) throw new Error('Could not refresh TikTok analytics');
      return data;
    },
    onSuccess: (data) => {
      // Seed the cache directly rather than invalidating: we already have the
      // authoritative answer, and an invalidate would spend another request to
      // fetch what is in hand.
      queryClient.setQueryData(['tiktok-insights', user?.id, openId], data);
      queryClient.invalidateQueries({ queryKey: ['tiktok-connection', user?.id] });
    },
  });
}
