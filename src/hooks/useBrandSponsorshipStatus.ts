import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandSponsorshipStatus {
  id: string;
  sponsorship_amount: number;
  proposal_message: string;
  status: 'pending' | 'accepted' | 'rejected';
  terms: any;
  created_at: string;
  updated_at: string;
}

export const useBrandSponsorshipStatus = (campaignId: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand-sponsorship-status', campaignId, user?.id],
    queryFn: async () => {
      if (!user) return null;

      // First get the brand's business profile ID
      const { data: brandProfile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .single();

      if (!brandProfile) return null;

      // Then get the sponsorship proposal
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('brand_id', brandProfile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as BrandSponsorshipStatus | null;
    },
    enabled: !!user && !!campaignId,
  });
};
