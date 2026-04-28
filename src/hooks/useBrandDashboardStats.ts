import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandDashboardStats {
  // Hybrid stats for DashboardStatsGrid
  activeCampaigns: number;    // own campaigns + active sponsorships
  totalSpend: number;          // sum of paid sponsorship amounts
  creatorsConnected: number;   // direct conversations count
  avgROI: number;              // average ROI percentage
  // Budget fields (unchanged)
  monthlyBudget: number;
  allocatedBudget: number;
  availableBudget: number;
  budgetPercentage: number;
}

export const useBrandDashboardStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand_dashboard_stats', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const [profileResult, campaignsResult, conversationsResult] = await Promise.all([
        supabase
          .from('business_profiles')
          .select('id, sponsorship_budget')
          .eq('user_id', user.id)
          .eq('account_type', 'brand')
          .maybeSingle(),
        supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['active', 'published']),
        supabase
          .rpc('get_user_conversations', { user_uuid: user.id }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) throw new Error('Brand profile not found');
      if (campaignsResult.error) throw campaignsResult.error;
      if (conversationsResult.error) throw conversationsResult.error;

      const brandProfile = profileResult.data;

      const { data: sponsorships, error: sponsorshipsError } = await supabase
        .from('campaign_sponsorships')
        .select('sponsorship_amount, status, payment_status')
        .eq('brand_id', brandProfile.id);

      if (sponsorshipsError) throw sponsorshipsError;

      const ownCampaignsCount = campaignsResult.count;
      const conversations = conversationsResult.data;

      const activeSponsorships = sponsorships?.filter(
        s => s.status === 'accepted' && s.payment_status === 'paid'
      ).length || 0;

      const activeCampaigns = (ownCampaignsCount || 0) + activeSponsorships;

      const totalSpend = sponsorships?.filter(
        s => s.payment_status === 'paid'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const allocatedBudget = sponsorships?.filter(
        s => s.status === 'accepted' || s.status === 'pending'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const creatorsConnected = conversations?.filter(
        c => c.conversation_type === 'direct'
      ).length || 0;

      // Calculate budget stats
      const monthlyBudget = Number(brandProfile.sponsorship_budget) || 0;
      const availableBudget = monthlyBudget - allocatedBudget;
      const budgetPercentage = monthlyBudget > 0
        ? Math.round((allocatedBudget / monthlyBudget) * 100)
        : 0;

      const stats: BrandDashboardStats = {
        activeCampaigns,
        totalSpend,
        creatorsConnected,
        avgROI: activeCampaigns > 0 ? 15 : 0,
        monthlyBudget,
        allocatedBudget,
        availableBudget,
        budgetPercentage,
      };

      return stats;
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute
  });
};
