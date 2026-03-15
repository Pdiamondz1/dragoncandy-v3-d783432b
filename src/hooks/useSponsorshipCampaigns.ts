import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SponsorshipCampaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  status: string;
  created_at: string;
  open_for_sponsorship: boolean;
  business_profile?: {
    business_name: string;
    logo_url?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    industry?: string;
  };
  application_count?: number;
  sponsorship_count?: number;
}

export const useSponsorshipCampaigns = (brandUserId?: string) => {
  return useQuery({
    queryKey: ['sponsorship-campaigns', brandUserId],
    queryFn: async () => {
      // Get campaigns open for sponsorship
      const { data: campaigns, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'published')
        .eq('open_for_sponsorship', true)
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Error fetching sponsorship campaigns:', campaignsError);
        throw campaignsError;
      }

      if (!campaigns || campaigns.length === 0) {
        return [];
      }

      // Get unique user IDs from campaigns
      const userIds = [...new Set(campaigns.map(campaign => campaign.user_id))];

      // Fetch business profiles for these users
      const { data: businessProfiles, error: profilesError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, postal_code, city, country, industry')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching business profiles:', profilesError);
        throw profilesError;
      }

      // Create a map of user_id to business profile
      const businessProfileMap = new Map(
        (businessProfiles || []).map(profile => [profile.user_id, profile])
      );

      // Enrich campaigns with additional data
      const enrichedCampaigns = await Promise.all(
        campaigns.map(async (campaign) => {
          // Get application count
          const { count: appCount } = await supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          // Get sponsorship count
          const { count: sponsorCount } = await supabase
            .from('campaign_sponsorships')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          const businessProfile = businessProfileMap.get(campaign.user_id);

          return {
            ...campaign,
            business_profile: businessProfile ? {
              business_name: businessProfile.business_name,
              logo_url: businessProfile.logo_url,
              postal_code: businessProfile.postal_code,
              city: businessProfile.city,
              country: businessProfile.country,
              industry: businessProfile.industry,
            } : undefined,
            application_count: appCount || 0,
            sponsorship_count: sponsorCount || 0,
          };
        })
      );

      return enrichedCampaigns as SponsorshipCampaign[];
    },
    enabled: true,
  });
};
