import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface BrandAnalytics {
  totalSponsorships: number;
  totalInvestment: number;
  activeCampaigns: number;
  pendingSponsorships: number;
  acceptedSponsorships: number;
  rejectedSponsorships: number;
}

export const useBrandAnalytics = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand_analytics', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Get the brand's business profile ID
      const { data: brandProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .single();

      if (profileError) throw profileError;
      if (!brandProfile) throw new Error('Brand profile not found');

      // Get sponsorship statistics
      const { data: sponsorships, error: sponsorshipsError } = await supabase
        .from('campaign_sponsorships')
        .select('sponsorship_amount, status, payment_status')
        .eq('brand_id', brandProfile.id);

      if (sponsorshipsError) throw sponsorshipsError;

      // Calculate analytics
      const totalSponsorships = sponsorships?.length || 0;
      const totalInvestment = sponsorships?.reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;
      const activeCampaigns = sponsorships?.filter(s => s.status === 'accepted' && s.payment_status === 'paid').length || 0;
      const pendingSponsorships = sponsorships?.filter(s => s.status === 'pending').length || 0;
      const acceptedSponsorships = sponsorships?.filter(s => s.status === 'accepted').length || 0;
      const rejectedSponsorships = sponsorships?.filter(s => s.status === 'rejected').length || 0;

      const analytics: BrandAnalytics = {
        totalSponsorships,
        totalInvestment,
        activeCampaigns,
        pendingSponsorships,
        acceptedSponsorships,
        rejectedSponsorships,
      };

      return analytics;
    },
    enabled: !!user,
  });
};
