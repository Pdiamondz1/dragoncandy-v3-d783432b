// src/hooks/useBrandActiveCampaigns.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrandCampaignItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  type: 'own' | 'sponsored';
}

export function useBrandActiveCampaigns() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand_active_campaigns', user?.id],
    queryFn: async (): Promise<BrandCampaignItem[]> => {
      if (!user) throw new Error('User not authenticated');

      // 1. Get brand's own campaigns
      const { data: ownCampaigns, error: ownError } = await supabase
        .from('campaigns')
        .select('id, title, status, deadline')
        .eq('user_id', user.id)
        .in('status', ['published', 'active'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (ownError) throw ownError;

      // 2. Get brand's sponsorships with campaign details
      const { data: brandProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('account_type', 'brand')
        .maybeSingle();

      if (profileError) throw profileError;

      let sponsoredItems: BrandCampaignItem[] = [];

      if (brandProfile) {
        const { data: sponsorships, error: sponsorError } = await supabase
          .from('campaign_sponsorships')
          .select(`
            id,
            sponsorship_amount,
            status,
            campaigns (id, title, status)
          `)
          .eq('brand_id', brandProfile.id)
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(5);

        if (sponsorError) throw sponsorError;

        sponsoredItems = (sponsorships || [])
          .filter((s) => s.campaigns)
          .map((s) => {
            const campaign = s.campaigns as unknown as { id: string; title: string; status: string };
            return {
              id: campaign.id,
              title: campaign.title,
              subtitle: `Sponsored · $${Number(s.sponsorship_amount).toLocaleString()} budget`,
              status: s.status,
              type: 'sponsored' as const,
            };
          });
      }

      // 3. Map own campaigns
      const ownItems: BrandCampaignItem[] = (ownCampaigns || []).map((c) => {
        const deadline = c.deadline
          ? new Date(c.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'No deadline';
        return {
          id: c.id,
          title: c.title,
          subtitle: `Due ${deadline}`,
          status: c.status,
          type: 'own' as const,
        };
      });

      // 4. Merge, deduplicate by id, return max 8
      const seen = new Set<string>();
      const merged: BrandCampaignItem[] = [];
      for (const item of [...ownItems, ...sponsoredItems]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }

      return merged.slice(0, 8);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
