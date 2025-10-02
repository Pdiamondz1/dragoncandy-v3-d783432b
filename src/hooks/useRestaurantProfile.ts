import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RestaurantProfile {
  id: string;
  user_id: string;
  business_name: string;
  logo_url: string | null;
  location: string | null;
  description: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  website_url: string | null;
  instagram_url: string | null;
  profile_slug: string | null;
}

export const useRestaurantProfile = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['restaurant-profile', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('business_profiles')
        .select('id, user_id, business_name, logo_url, location, description, average_rating, total_reviews, website_url, instagram_url, profile_slug')
        .eq('user_id', userId)
        .eq('account_type', 'restaurant')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as RestaurantProfile | null;
    },
    enabled: !!userId,
  });
};
