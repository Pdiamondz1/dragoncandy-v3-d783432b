import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface BrandDashboardStats {
  activeSponsorships: number;
  campaignsDiscovered: number;
  creatorsConnected: number;
  monthlyBudget: number;
  allocatedBudget: number;
  availableBudget: number;
  budgetPercentage: number;
  marketingROI: number;
}

export const useBrandDashboardStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand_dashboard_stats', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Get the brand's business profile
      const { data: brandProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select('id, sponsorship_budget')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .maybeSingle();

      if (profileError) throw profileError;
      if (!brandProfile) throw new Error('Brand profile not found');

      // Get active sponsorships (accepted and paid)
      const { data: sponsorships, error: sponsorshipsError } = await supabase
        .from('campaign_sponsorships')
        .select('sponsorship_amount, status, payment_status')
        .eq('brand_id', brandProfile.id);

      if (sponsorshipsError) throw sponsorshipsError;

      const activeSponsorships = sponsorships?.filter(
        s => s.status === 'accepted' && s.payment_status === 'paid'
      ).length || 0;

      const allocatedBudget = sponsorships?.filter(
        s => s.status === 'accepted' || s.status === 'pending'
      ).reduce((sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0) || 0;

      // Count available campaigns (open for sponsorship)
      const { count: campaignsCount, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('open_for_sponsorship', true)
        .eq('status', 'published');

      if (campaignsError) throw campaignsError;

      // Count direct conversations with creators
      const { data: conversations, error: conversationsError } = await supabase
        .rpc('get_user_conversations', { user_uuid: user.id });

      if (conversationsError) throw conversationsError;

      const creatorsConnected = conversations?.filter(
        c => c.conversation_type === 'direct'
      ).length || 0;

      // Calculate budget stats
      const monthlyBudget = Number(brandProfile.sponsorship_budget) || 0;
      const availableBudget = monthlyBudget - allocatedBudget;
      const budgetPercentage = monthlyBudget > 0 
        ? Math.round((allocatedBudget / monthlyBudget) * 100) 
        : 0;

      // Calculate marketing ROI (placeholder - would need actual metrics)
      // For now, using a simple formula: (active sponsorships * 15%) as estimated ROI
      const marketingROI = activeSponsorships > 0 ? 15 : 0;

      const stats: BrandDashboardStats = {
        activeSponsorships,
        campaignsDiscovered: campaignsCount || 0,
        creatorsConnected,
        monthlyBudget,
        allocatedBudget,
        availableBudget,
        budgetPercentage,
        marketingROI,
      };

      return stats;
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute
  });
};
