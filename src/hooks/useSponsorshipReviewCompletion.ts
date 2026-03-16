import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SponsorshipForReview {
  id: string;
  campaignTitle: string;
  otherPartyName: string;
  otherPartyId: string;
  userRole: 'brand' | 'business';
  canReview: boolean;
  completedAt: string;
}

export const useSponsorshipReviewCompletion = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['sponsorship-review-completion', user?.id],
    queryFn: async (): Promise<SponsorshipForReview[]> => {
      if (!user?.id) return [];

      // Get user's business profiles (could be brand or restaurant)
      const { data: userProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('id, business_name, account_type')
        .eq('user_id', user.id);

      if (profileError) throw profileError;
      if (!userProfiles || userProfiles.length === 0) return [];

      const profileIds = userProfiles.map(p => p.id);
      const sponsorshipsForReview: SponsorshipForReview[] = [];

      // Fetch completed sponsorships where user is the brand
      const { data: brandSponsorships, error: brandError } = await supabase
        .from('campaign_sponsorships')
        .select(`
          id,
          completed_at,
          review_status,
          restaurant_id,
          campaigns (title)
        `)
        .in('brand_id', profileIds)
        .not('completed_at', 'is', null)
        .neq('review_status', 'both_reviewed');

      if (brandError) throw brandError;

      // Fetch completed sponsorships where user is the restaurant/business
      const { data: businessSponsorships, error: businessError } = await supabase
        .from('campaign_sponsorships')
        .select(`
          id,
          completed_at,
          review_status,
          brand_id,
          campaigns (title)
        `)
        .in('restaurant_id', profileIds)
        .not('completed_at', 'is', null)
        .neq('review_status', 'both_reviewed');

      if (businessError) throw businessError;

      // Check existing reviews from this user
      const { data: existingReviews, error: reviewsError } = await supabase
        .from('project_reviews')
        .select('sponsorship_id')
        .eq('reviewer_id', user.id)
        .not('sponsorship_id', 'is', null);

      if (reviewsError) throw reviewsError;

      const reviewedSponsorshipIds = new Set(
        existingReviews?.map(r => r.sponsorship_id) || []
      );

      // Process brand sponsorships
      for (const sponsorship of brandSponsorships || []) {
        if (reviewedSponsorshipIds.has(sponsorship.id)) continue;

        // Get restaurant profile name
        const { data: restaurantProfile } = await supabase
          .from('business_profiles')
          .select('user_id, business_name')
          .eq('id', sponsorship.restaurant_id)
          .single();

        if (restaurantProfile) {
          sponsorshipsForReview.push({
            id: sponsorship.id,
            campaignTitle: (sponsorship.campaigns as any)?.title || 'Unknown Campaign',
            otherPartyName: restaurantProfile.business_name,
            otherPartyId: restaurantProfile.user_id,
            userRole: 'brand',
            canReview: true,
            completedAt: sponsorship.completed_at!,
          });
        }
      }

      // Process business sponsorships
      for (const sponsorship of businessSponsorships || []) {
        if (reviewedSponsorshipIds.has(sponsorship.id)) continue;

        // Get brand profile name
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('user_id, business_name')
          .eq('id', sponsorship.brand_id)
          .single();

        if (brandProfile) {
          sponsorshipsForReview.push({
            id: sponsorship.id,
            campaignTitle: (sponsorship.campaigns as any)?.title || 'Unknown Campaign',
            otherPartyName: brandProfile.business_name,
            otherPartyId: brandProfile.user_id,
            userRole: 'business',
            canReview: true,
            completedAt: sponsorship.completed_at!,
          });
        }
      }

      return sponsorshipsForReview;
    },
    enabled: !!user?.id,
  });
};
