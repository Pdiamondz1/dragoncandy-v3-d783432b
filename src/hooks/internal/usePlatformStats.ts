import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformStats {
  // `*_all` = total INCL. synthetic; the un-suffixed counts are real (synthetic-excluded). The gap
  // (all − real) is the synthetic volume the Overview surfaces as a banner + per-card "of N total".
  users: { total: number; total_all: number; by_role: Record<string, number>; by_role_all?: Record<string, number> };
  businesses: {
    restaurants: number; restaurants_all: number;
    brands: number; brands_all: number;
    locations: number; locations_all: number;
  };
  campaigns: { total: number; total_all: number; by_status: Record<string, number>; by_status_all?: Record<string, number> };
  dragonshare: {
    posts_total: number;
    posts_total_all: number;
    posts_by_status: Record<string, number>;
    posts_by_status_all?: Record<string, number>;
    boosts_total: number;
    boosts_total_all: number;
  };
  promotions: { total: number; total_all: number; by_status: Record<string, number> };
  content: {
    social_posts_logged: number; social_posts_logged_all: number;
    performance_tracked_posts: number; performance_tracked_posts_all: number;
  };
  social_connections: { total: number; total_all: number; by_platform: Record<string, number>; by_platform_all?: Record<string, number> };
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
