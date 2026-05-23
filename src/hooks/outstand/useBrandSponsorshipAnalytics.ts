import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandSponsorshipAnalytics {
  id: string;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  restaurantId: string;
  creatorName: string | null;
  creatorId: string | null;
  sponsorshipAmount: number | null;
  status: string;
  createdAt: string;
  campaignDeadline: string | null;
}

export function useBrandSponsorshipAnalytics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand-sponsorship-analytics', user?.id],
    queryFn: async (): Promise<BrandSponsorshipAnalytics[]> => {
      // Step 1: Get the brand's business_profiles.id
      // brand_id FK references business_profiles.id, not auth.users.id
      const { data: profile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .eq('account_type', 'brand')
        .single();

      if (!profile) return [];

      // Step 2: Query sponsorships using the business_profiles.id
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          id,
          campaign_id,
          restaurant_id,
          sponsorship_amount,
          status,
          created_at,
          campaigns!campaign_id (
            title,
            deadline,
            user_id
          )
        `)
        .eq('brand_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      // Step 3: Resolve restaurant names via the campaign owner's user_id
      const restaurantUserIds = [
        ...new Set(
          data
            .map((s) => (s.campaigns as unknown as { title: string; deadline: string | null; user_id: string } | null)?.user_id)
            .filter((id): id is string => !!id)
        ),
      ];

      const { data: restaurantProfiles } = restaurantUserIds.length
        ? await supabase
            .from('business_profiles')
            .select('user_id, business_name')
            .in('user_id', restaurantUserIds)
        : { data: [] };

      const restaurantNameByUserId = new Map(
        (restaurantProfiles ?? []).map((p) => [p.user_id, p.business_name])
      );

      // Step 4: Resolve accepted creators per campaign
      const campaignIds = data.map((s) => s.campaign_id);

      const { data: applications } = campaignIds.length
        ? await supabase
            .from('campaign_applications')
            .select('campaign_id, creator_id, profiles!creator_id(full_name)')
            .in('campaign_id', campaignIds)
            .eq('status', 'accepted')
        : { data: [] };

      const creatorByCampaignId = new Map(
        (applications ?? []).map((a) => [
          a.campaign_id,
          {
            id: a.creator_id as string,
            name: (a.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
          },
        ])
      );

      return data.map((s) => {
        const campaign = s.campaigns as unknown as { title: string; deadline: string | null; user_id: string } | null;
        const creator = creatorByCampaignId.get(s.campaign_id);
        return {
          id: s.id,
          campaignId: s.campaign_id,
          campaignTitle: campaign?.title ?? 'Untitled Campaign',
          restaurantName: restaurantNameByUserId.get(campaign?.user_id ?? '') ?? 'Unknown Restaurant',
          restaurantId: s.restaurant_id,
          creatorName: creator?.name ?? null,
          creatorId: creator?.id ?? null,
          sponsorshipAmount: s.sponsorship_amount,
          status: s.status,
          createdAt: s.created_at,
          campaignDeadline: campaign?.deadline ?? null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });
}
