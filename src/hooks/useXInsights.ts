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

/**
 * The connection changed underneath a read, so our cached view of BOTH queries
 * is describing something that no longer exists.
 *
 * Distinct from `needs_reconnect`: nothing is broken and the user has nothing to
 * fix. They reconnected — possibly to a different X account — while a read was
 * in flight, and the server correctly threw away figures that belonged to the
 * previous account rather than showing them under the new one. The right
 * response is to fetch again, not to show an error.
 */
const CHANGED_CODES = new Set(['connection_changed']);

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

/**
 * KEYED ON THE X ACCOUNT, NOT JUST THE USER — and that is a correctness fix, not
 * a cache-tuning one.
 *
 * Under a user-only key, reconnecting to a DIFFERENT X account leaves the
 * previous account's figures fresh for fifteen minutes under a key the new
 * account also reads. The card then renders one account's metrics beneath
 * another account's name, which is the same fabrication-by-attribution the
 * server guards against on the stale-claim path: every number is real and the
 * subject is wrong.
 *
 * That could be handled by remembering to invalidate on every path that changes
 * the connection. Including the account in the key means there is nothing to
 * remember: a different account is a different cache entry and structurally
 * cannot read the old one.
 */
export function useXInsights(
  xUserId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['x-insights', user?.id, xUserId],
    enabled: !!user?.id && !!xUserId && options.enabled !== false,
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
        if (CHANGED_CODES.has(code)) {
          // Refetch both: the connection identity moved, so the card's name and
          // its figures are stale together.
          void queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
          // Prefix match: the account segment varies, and after a change we do
          // not know which entry is stale — only that any of them may be.
          void queryClient.invalidateQueries({ queryKey: ['x-insights', user?.id] });
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
export function useRefreshXInsights(xUserId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<XInsightsResponse> => {
      const { data, error } = await supabase.functions.invoke<XInsightsResponse>('x-insights', {
        body: { force: true },
      });
      if (error) {
        // The SAME code handling as the query above, and it has to be here too.
        // A forced refresh is the most likely place to discover a dead grant —
        // it is what a user presses when the numbers look wrong — and the server
        // has already written `needs_reconnect` to the row by the time we see
        // this. Without the invalidate, the card goes on saying "Connected" and
        // keeps hiding the one button that fixes it, which is the whole defect
        // this pattern exists to prevent.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code) || CHANGED_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
        }
        if (CHANGED_CODES.has(code)) {
          // Prefix match: the account segment varies, and after a change we do
          // not know which entry is stale — only that any of them may be.
          void queryClient.invalidateQueries({ queryKey: ['x-insights', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not refresh X analytics'));
      }
      if (!data) throw new Error('Could not refresh X analytics');
      return data;
    },
    onSuccess: (data) => {
      // Seed the cache directly rather than invalidating: we already have the
      // authoritative answer, and an invalidate would spend another request to
      // fetch what is in hand.
      queryClient.setQueryData(['x-insights', user?.id, xUserId], data);
      queryClient.invalidateQueries({ queryKey: ['x-connection', user?.id] });
    },
  });
}
