import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  latestPerPost,
  rankByEngagement,
  signalVerdict,
  type PerformanceRow,
  type PostPerformance,
  type SignalVerdict,
} from '@/lib/postPerformance';

/**
 * Real per-post engagement for the signed-in user.
 *
 * `content_performance` has been accumulating since June and had ZERO readers
 * anywhere in src/ — every metric captured was written and never shown. This is
 * the first one.
 *
 * THE FILTER IS THE FEATURE: `social_post_log.verified_at IS NOT NULL`.
 *
 * Only server-side code sets `verified_at`, and it is the same gate
 * `content-performance-capture` uses to decide what is real. Applying it here
 * is not belt-and-braces — it is what keeps six FABRICATED rows off the screen.
 * The pre-fix capture job wrote all-zero measurements whenever the provider
 * returned nothing, so `content_performance` currently holds 9 legacy rows for
 * 3 posts: one with genuine numbers (1,388 views) and two that are zero across
 * every milestone. Averaging those together is exactly the "runs perfectly,
 * plausible, wrong" failure this whole area keeps producing. None of the 9 are
 * verified, so this hook shows none of them — the rows stay as history and can
 * never be rendered as fact.
 *
 * Consequence, stated plainly rather than discovered later: today this returns
 * ZERO posts on prod. The only verified post was published 2026-08-06 and its
 * first milestone has not elapsed. That is the correct answer, and the UI says
 * so instead of drawing an empty chart.
 */
export interface PostPerformanceResult {
  /** Ranked best-first by interactions. Empty until measured posts exist. */
  posts: PostPerformance[];
  /** Whether there are enough measured posts to present a pattern, plus N. */
  signal: SignalVerdict;
  isLoading: boolean;
  error: Error | null;
}

export function usePostPerformance(): PostPerformanceResult {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<PostPerformance[]>({
    queryKey: ['post-performance', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // The inner join to social_post_log is what applies the verified gate;
      // `!inner` makes it a filter rather than a nullable embed.
      const { data: rows, error: qErr } = await supabase
        .from('content_performance')
        .select(
          'outstand_post_id, platform, milestone, captured_at, is_settled, views, likes, comments, shares, saves, reach, engagement_rate, social_post_log!inner(verified_at)',
        )
        .eq('user_id', user.id)
        .not('social_post_log.verified_at', 'is', null)
        .order('captured_at', { ascending: false })
        .limit(500);

      if (qErr) throw qErr;

      return rankByEngagement(latestPerPost((rows ?? []) as unknown as PerformanceRow[]));
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const posts = data ?? [];
  return {
    posts,
    signal: signalVerdict(posts.length),
    isLoading,
    error: (error as Error) ?? null,
  };
}
