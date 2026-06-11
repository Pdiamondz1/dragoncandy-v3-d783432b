import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformStats {
  users: { total: number; by_role: Record<string, number> };
  businesses: { restaurants: number; brands: number; locations: number };
  campaigns: { total: number; by_status: Record<string, number> };
  dragonshare: {
    posts_total: number;
    posts_by_status: Record<string, number>;
    boosts_total: number;
  };
  promotions: { total: number; by_status: Record<string, number> };
  content: { social_posts_logged: number; performance_tracked_posts: number };
  social_connections: { total: number; by_platform: Record<string, number> };
  generated_at: string;
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['aios', 'platform-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aios_platform_stats');
      if (error) {
        console.error('aios_platform_stats failed:', error);
        throw error;
      }
      return data as unknown as PlatformStats;
    },
  });
}
