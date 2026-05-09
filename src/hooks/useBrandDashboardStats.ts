import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { DashboardSummary } from '@/types/dashboard';

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

      // Get dashboard summary in one call (replaces 4+ queries)
      const [summaryResult, profileResult] = await Promise.all([
        supabase.rpc('get_dashboard_summary', { p_user_id: user.id }),
        supabase
          .from('business_profiles')
          .select('id, sponsorship_budget')
          .eq('user_id', user.id)
          .eq('account_type', 'brand')
          .maybeSingle(),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) throw new Error('Brand profile not found');

      const summary = summaryResult.data as DashboardSummary;

      const brandProfile = profileResult.data;

      // Sponsorship stats still need brand_id
      const { data: sponsorships, error: sponsorshipsError } = await supabase
        .from('campaign_sponsorships')
        .select('sponsorship_amount, status, payment_status')
        .eq('brand_id', brandProfile.id);

      if (sponsorshipsError) throw sponsorshipsError;

      const activeSponsorships = sponsorships?.filter(
        s => s.status === 'accepted' && s.payment_status === 'paid'
      ).length || 0;

      const activeCampaigns = summary.active_campaigns + activeSponsorships;

      const totalSpend = sponsorships?.filter(
        s => s.payment_status === 'paid'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const allocatedBudget = sponsorships?.filter(
        s => s.status === 'accepted' || s.status === 'pending'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      const monthlyBudget = Number(brandProfile.sponsorship_budget) || 0;
      const availableBudget = monthlyBudget - allocatedBudget;
      const budgetPercentage = monthlyBudget > 0
        ? Math.round((allocatedBudget / monthlyBudget) * 100)
        : 0;

      // Conversations count
      const { data: conversations } = await supabase
        .rpc('get_user_conversations', { user_uuid: user.id });

      const creatorsConnected = conversations?.filter(
        (c: { conversation_type: string }) => c.conversation_type === 'direct'
      ).length || 0;

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
    staleTime: 300_000,
  });
};
