import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CampaignSponsorshipDetail {
  id: string;
  campaign_id: string;
  brand_id: string;
  restaurant_id: string;
  sponsorship_amount: number;
  status: string;
  payment_status: string | null;
  brand_completion_status: string | null;
  business_completion_status: string | null;
  completed_at: string | null;
  review_status: string | null;
  brand_profile: {
    business_name: string;
    logo_url: string | null;
    user_id: string;
  } | null;
}

export const useCampaignSponsorshipDetail = (campaignId: string) => {
  return useQuery({
    queryKey: ['campaign-sponsorship-detail', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          id, campaign_id, brand_id, restaurant_id,
          sponsorship_amount, status, payment_status,
          brand_completion_status, business_completion_status,
          completed_at, review_status,
          brand_profile:business_profiles!brand_id (
            business_name, logo_url, user_id
          )
        `)
        .eq('campaign_id', campaignId)
        .in('status', ['accepted', 'completed'])
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data as CampaignSponsorshipDetail | null;
    },
    enabled: !!campaignId,
    staleTime: 30000,
  });
};
