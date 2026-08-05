import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CreatorPlatformStat {
  platform: string;
  followers: number;
}

export interface CreatorSocialStats {
  platforms: CreatorPlatformStat[];
  totalFollowers: number;
  avgEngagementRate: number | null;
}

/**
 * Shape of `get_public_social_proof`. Declared locally because the RPC postdates
 * the last `supabase gen types` run — regenerating types would sweep in unrelated
 * schema drift, so the contract is pinned here and kept in step with the
 * migration that defines it.
 */
interface PublicSocialProofRow {
  connected_count: number | null;
  platform: string | null;
  followers: number | string | null;
}

const MIN_DISPLAY_FOLLOWERS = 100;

export function useCreatorSocialStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-social-stats', userId],
    queryFn: async (): Promise<CreatorSocialStats> => {
      if (!userId) return { platforms: [], totalFollowers: 0, avgEngagementRate: null };

      // Same story as useVerifiedStatus: this reads ANOTHER user's cached
      // metrics, which own-row RLS forbids. It previously relied on a blanket
      // `USING (true)` policy that is gone from prod, so these stats have been
      // rendering blank on public profiles and browse cards.
      //
      // It also filtered `metric_type` on 'engagement_rate', which this table has
      // NEVER contained — the live vocabulary is followers|engagement|reach|posts
      // — so average engagement was null even for your own profile. The RPC
      // returns followers only; engagement is deliberately not public.
      const { data: rows, error } = await supabase.rpc('get_public_social_proof', {
        p_user_id: userId,
      });

      if (error || !rows || rows.length === 0) {
        return { platforms: [], totalFollowers: 0, avgEngagementRate: null };
      }

      const platforms: CreatorPlatformStat[] = (rows as PublicSocialProofRow[])
        .filter((r) => r.platform !== null)
        .map((r) => ({ platform: String(r.platform), followers: Number(r.followers ?? 0) }))
        .filter((p) => p.followers >= MIN_DISPLAY_FOLLOWERS);

      return {
        platforms,
        totalFollowers: platforms.reduce((sum, p) => sum + p.followers, 0),
        avgEngagementRate: null,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
