
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Campaign } from '@/hooks/useCampaignQueries';

export interface PublicCampaign extends Campaign {
  business_profile?: {
    business_name: string;
    logo_url?: string;
    postal_code?: string;
    city?: string;
    country?: string;
  };
  application_count?: number;
  user_applied?: boolean;
  application_status?: 'pending' | 'accepted' | 'rejected';
}

export const usePublicCampaigns = (userId?: string) => {
  return useQuery({
    queryKey: ['public-campaigns', userId],
    queryFn: async () => {
      console.log('Fetching public campaigns for user:', userId);
      
      // First, get campaigns that have active collaborations
      const { data: assignedCampaigns, error: assignedError } = await supabase
        .from('campaign_collaborations')
        .select('campaign_id')
        .eq('status', 'active');

      if (assignedError) {
        console.error('Error fetching assigned campaigns:', assignedError);
        throw assignedError;
      }

      // Extract campaign IDs that are already assigned
      const assignedCampaignIds = (assignedCampaigns || []).map(c => c.campaign_id);
      console.log('Assigned campaign IDs:', assignedCampaignIds);

      // Get published campaigns excluding assigned ones
      let query = supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'published');

      // Only add the not.in filter if there are assigned campaigns
      if (assignedCampaignIds.length > 0) {
        query = query.not('id', 'in', `(${assignedCampaignIds.join(',')})`);
      }

      const { data: campaigns, error: campaignsError } = await query
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Error fetching campaigns:', campaignsError);
        throw campaignsError;
      }

      if (!campaigns || campaigns.length === 0) {
        console.log('No campaigns found');
        return [];
      }

      // Get unique user IDs from campaigns
      const userIds = [...new Set(campaigns.map(campaign => campaign.user_id))];

      // Fetch business profiles for these users
      const { data: businessProfiles, error: profilesError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, postal_code, city, country')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching business profiles:', profilesError);
        throw profilesError;
      }

      // Create a map of user_id to business profile for quick lookup
      const businessProfileMap = new Map(
        (businessProfiles || []).map(profile => [profile.user_id, profile])
      );

      // Get application counts and user application status if user is provided
      const enrichedCampaigns = await Promise.all(
        campaigns.map(async (campaign) => {
          // Get application count
          const { count } = await supabase
            .from('campaign_applications')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          // Check if user has applied and get application status (only if userId provided)
          let userApplied = false;
          let applicationStatus: 'pending' | 'accepted' | 'rejected' | undefined = undefined;

          if (userId) {
            const { data: userApplication } = await supabase
              .from('campaign_applications')
              .select('id, status')
              .eq('campaign_id', campaign.id)
              .eq('creator_id', userId)
              .maybeSingle();
            
            userApplied = !!userApplication;
            applicationStatus = userApplication?.status as 'pending' | 'accepted' | 'rejected' | undefined;
          }

          // Get business profile for this campaign
          const businessProfile = businessProfileMap.get(campaign.user_id);

          return {
            ...campaign,
            business_profile: businessProfile ? {
              business_name: businessProfile.business_name,
              logo_url: businessProfile.logo_url,
              postal_code: businessProfile.postal_code,
              city: businessProfile.city,
              country: businessProfile.country,
            } : undefined,
            application_count: count || 0,
            user_applied: userApplied,
            application_status: applicationStatus,
          };
        })
      );

      console.log('Fetched public campaigns:', enrichedCampaigns);
      return enrichedCampaigns as PublicCampaign[];
    },
    enabled: true,
  });
};
