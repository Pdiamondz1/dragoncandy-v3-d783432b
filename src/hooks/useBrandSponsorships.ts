import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandSponsorship {
  id: string;
  campaign_id: string;
  brand_id: string;
  restaurant_id: string;
  sponsorship_amount: number;
  proposal_message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  terms: any;
  created_at: string;
  updated_at: string;
  brand_completion_status?: string;
  business_completion_status?: string;
  completed_at?: string;
  review_status?: string;
  campaigns?: {
    id: string;
    title: string;
    description: string;
    deadline?: string;
    platforms?: string[];
  };
  restaurant_profile?: {
    id: string;
    business_name: string;
    logo_url: string;
    user_id: string;
  };
}

export const useBrandSponsorships = () => {
  const { user } = useAuth();

  const { data: sponsorships, isLoading } = useQuery({
    queryKey: ['brand-sponsorships', user?.id],
    queryFn: async () => {
      // Get user's brand profile first
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .eq('account_type', 'brand')
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          *,
          campaigns (
            id,
            title,
            description,
            deadline,
            platforms
          ),
          restaurant_profile:business_profiles!restaurant_id (
            id,
            business_name,
            logo_url,
            user_id
          )
        `)
        .eq('brand_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BrandSponsorship[];
    },
    enabled: !!user,
  });

  return {
    sponsorships: sponsorships || [],
    isLoading,
  };
};
