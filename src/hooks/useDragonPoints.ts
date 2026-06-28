import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

export interface DragonPoints { balance: number; tier: string; }

/** Launch gate for the consumer Dragon Rewards display (DragonPointsCard + DragonTierBadge).
 *  Single source of the flag name. Fail-safe-off via useFeatureFlag (hidden until explicitly
 *  enabled), and anon-readable so public-profile tier badges work for logged-out visitors —
 *  unlike dre_config.go_live_at (authenticated-read only), which gates only the bell. */
export function useDragonRewardsEnabled(): boolean {
  return useFeatureFlag('DRAGON_REWARDS_ENABLED');
}

/** Current user's own balance + tier (own-row RLS). */
export function useDragonPoints() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dragon-points', user?.id],
    queryFn: async (): Promise<DragonPoints> => {
      const { data, error } = await supabase
        .from('dragon_point_balances')
        .select('balance, tier')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return { balance: data?.balance ?? 0, tier: data?.tier ?? 'egg' };
    },
    enabled: !!user?.id,
  });
}

/** Any user's public tier (tier-only view) — for public profiles. */
export function usePublicDragonTier(userId?: string | null) {
  return useQuery({
    queryKey: ['public-dragon-tier', userId],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('public_dragon_tiers')
        .select('tier')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.tier ?? 'egg';
    },
    enabled: !!userId,
  });
}
