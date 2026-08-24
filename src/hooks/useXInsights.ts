import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { codeFromInvokeError, messageFromInvokeError } from '@/lib/invokeError';

/**
 * Read-only X (Twitter) metrics.
 *
 * Every number here is nullable and the card renders a null as "—". A metric X
 * did not return is ABSENT, never zero: the two look identical on a dashboard
 * and mean opposite things, and only one of them is ours to assert. See
 * [[Honest Analytics]].
 *
 * `posts_with_organic` is the field to read before believing `impressions`,
 * `profile_clicks` or `link_clicks`. X supplies organic metrics only for posts
 * under 30 days old that the connected user wrote, so those three can describe a
 * SUBSET of `posts_counted`. When it is lower, the card says which.
 *
 * THE SERVER CACHES, AND THAT IS DELIBERATELY NOT NEGOTIABLE FROM HERE. X bills
 * per read (~$0.010 a user read, ~$0.005 a post read) where YouTube, Instagram
 * and Facebook insights are free. The snapshot lives on the row for 15 minutes
 * and a forced refresh still respects a server-side floor, so no amount of
 * clicking in this UI can run up a bill.
 */

/**
 * The code meaning the SERVER has just set the connection to `needs_reconnect`,
 * so our cached connection is stale by exactly the field that decides whether
 * the user is offered the only button that fixes their error.
 *
 * `rate_limited` is deliberately absent, for the same reason it is absent from
 * the Facebook hook: telling a user to reauthorize because X is throttling them
 * is the defect the YouTube connector shipped with quota 403s. Being rate
 * limited is not being revoked.
 */
const RECONNECT_CODES = new Set(['needs_reconnect']);

export interface XPostMetrics {
  id: string;
  created_at: string | null;
  text: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  impressions: number | null;
  profile_clicks: number | null;
  link_clicks: number | null;
}

export interface XInsights {
  account: {
    x_user_id: string;
    username: string | null;
    display_name: string | null;
    followers_count: number | null;
    following_count: number | null;
    tweet_count: number | null;
  };
  /** 28, and shorter than X's 30-day organic limit on purpose. */
  window_days: number;
  /** How many posts the totals are actually derived from. */
  posts_counted: number;
  /** How many of those carried organic metrics. Read this before trusting impressions. */
  posts_with_organic: number;
  totals: {
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    impressions: number | null;
    profile_clicks: number | null;
    link_clicks: number | null;
  };
  top_posts: XPostMetrics[];
  fetched_at: string;
}

interface XInsightsResponse {
  insights: XInsights;
  cached: boolean;
  cached_at: string | null;
}

export function useXInsights(options: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['x-insights', user?.id],
    enabled: !!user?.id && options.enabled !== false,
    // Matches the server's own cache window. A shorter one here would just make
    // requests the server answers from cache anyway; a longer one would show a
    // stale snapshot after the server had a fresher one.
    staleTime: 15 * 60 * 1000,
    // A dead grant will not fix itself on retry, and a rate limit is made worse
    // by one. Both need time or the user, and retrying only delays the message.
    retry: false,
    queryFn: async (): Promise<XInsightsResponse> => {
      const { data, error } = await supabase.functions.invoke<XInsightsResponse>('x-insights', {
        body: {},
      });

      if (error) {
        // Read the CODE before the message: the server has already written
        // `needs_reconnect` to the row, so the connection query must refetch or
        // the card keeps saying "Connected" while hiding the Reconnect button
        // behind an error the user cannot act on.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not read X analytics'));
      }
      if (!data) throw new Error('Could not read X analytics');
      return data;
    },
  });
}

/**
 * Ask the server for a fresh read.
 *
 * Named `force` rather than `refresh` because it is a request, not a guarantee:
 * the server keeps a 60-second floor under it, so a snapshot taken moments ago
 * comes back unchanged with its original timestamp. That is the honest
 * behaviour — the alternative is a button whose cost is set by whoever is
 * clicking it.
 */
export function useRefreshXInsights() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<XInsightsResponse> => {
      const { data, error } = await supabase.functions.invoke<XInsightsResponse>('x-insights', {
        body: { force: true },
      });
      if (error) {
        throw new Error(await messageFromInvokeError(error, 'Could not refresh X analytics'));
      }
      if (!data) throw new Error('Could not refresh X analytics');
      return data;
    },
    onSuccess: (data) => {
      // Seed the cache directly rather than invalidating: we already have the
      // authoritative answer, and an invalidate would spend another request to
      // fetch what is in hand.
      queryClient.setQueryData(['x-insights', user?.id], data);
      queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
    },
  });
}
