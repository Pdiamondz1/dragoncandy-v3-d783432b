
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Campaign } from '@/hooks/useCampaignQueries';

export interface PublicCampaign extends Campaign {
  business_profile?: {
    business_name: string;
    logo_url?: string;
    location?: string;
  };
  application_count?: number;
  user_applied?: boolean;
}

export const usePublicCampaigns = (userId?: string) => {
  return useQuery({
    queryKey: ['public-campaigns', userId],
    queryFn: async () => {
      console.log('Fetching public campaigns for user:', userId);
      
      // First get published campaigns with business profile data
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          business_profiles!inner(
            business_name,
            logo_url,
            location
          )
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching public campaigns:', error);
        throw error;
      }

      // Get application counts and user application status if user is provided
      const enrichedCampaigns = await Promise.all(
        (campaigns || []).map(async (campaign) => {
          // Get application count
          const { count } = await supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          // Check if user has applied (only if userId provided)
          let userApplied = false;
          if (userId) {
            const { data: userApplication } = await supabase
              .from('campaign_applications')
              .select('id')
              .eq('campaign_id', campaign.id)
              .eq('creator_id', userId)
              .maybeSingle();
            
            userApplied = !!userApplication;
          }

          return {
            ...campaign,
            business_profile: Array.isArray(campaign.business_profiles) 
              ? campaign.business_profiles[0] 
              : campaign.business_profiles,
            application_count: count || 0,
            user_applied: userApplied,
          };
        })
      );

      console.log('Fetched public campaigns:', enrichedCampaigns);
      return enrichedCampaigns as PublicCampaign[];
    },
    enabled: true,
  });
};
