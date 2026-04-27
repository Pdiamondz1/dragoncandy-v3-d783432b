// src/hooks/useCampaignDetailEnriched.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignDetail } from './useCampaignDetail';
import type { CampaignDetail } from './useCampaignDetail';

export interface BusinessProfile {
  business_name: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  profile_slug: string | null;
  user_id: string;
}

export interface EnrichedCampaignDetail extends CampaignDetail {
  matchScore: number | null;
  businessProfile: BusinessProfile | null;
  applicationCount: number;
  completedCampaignCount: number;
}

export const useCampaignDetailEnriched = (
  campaignId: string | null,
  campaignOwnerId: string | null
) => {
  const { user } = useAuth();
  const baseDetail = useCampaignDetail(campaignId);

  const enriched = useQuery({
    queryKey: ['campaign-detail-enriched', campaignId, user?.id, campaignOwnerId],
    queryFn: async (): Promise<{
      matchScore: number | null;
      businessProfile: BusinessProfile | null;
      applicationCount: number;
      completedCampaignCount: number;
    }> => {
      if (!campaignId) throw new Error('No campaign ID');

      const [matchResult, businessResult, appCountResult, completedCountResult] =
        await Promise.all([
          user?.id
            ? supabase
                .from('campaign_matches')
                .select('match_score')
                .eq('campaign_id', campaignId)
                .eq('creator_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          campaignOwnerId
            ? supabase
                .from('business_profiles')
                .select(
                  'business_name, logo_url, city, country, average_rating, total_reviews, profile_slug, user_id'
                )
                .eq('user_id', campaignOwnerId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          supabase
            .from('campaign_applications')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId),

          campaignOwnerId
            ? supabase
                .from('campaigns')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', campaignOwnerId)
                .eq('status', 'completed')
            : Promise.resolve({ data: null, error: null, count: 0 }),
        ]);

      return {
        matchScore: matchResult.data?.match_score ?? null,
        businessProfile: businessResult.data as BusinessProfile | null,
        applicationCount: appCountResult.count ?? 0,
        completedCampaignCount: completedCountResult.count ?? 0,
      };
    },
    enabled: !!campaignId,
  });

  const data: EnrichedCampaignDetail | undefined =
    baseDetail.data && enriched.data
      ? {
          ...baseDetail.data,
          ...enriched.data,
        }
      : undefined;

  return {
    data,
    isLoading: baseDetail.isLoading || enriched.isLoading,
    error: baseDetail.error || enriched.error,
  };
};
