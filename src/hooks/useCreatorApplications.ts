import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ApplicationCampaign {
  id: string;
  title: string;
  user_id: string;
  description: string | null;
  goals: string | null;
  style: string | null;
  tone: string | null;
  delivery_type: string | null;
  pricing_type: string | null;
  fixed_price: number | null;
  budget_min: number | null;
  budget_max: number | null;
  deliverables: string[] | null;
}

interface ApplicationBusinessProfile {
  business_name: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
}

export interface CreatorApplication {
  id: string;
  campaign_id: string;
  creator_id: string;
  intro_message: string | null;
  proposed_timeline: string | null;
  proposed_rate: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'counter_offered';
  created_at: string;
  updated_at: string;
  campaign?: ApplicationCampaign;
  business_profile?: ApplicationBusinessProfile;
}

export const useCreatorApplications = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-applications', user?.id],
    queryFn: async (): Promise<CreatorApplication[]> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Step 1: Fetch applications with campaign data
      const { data: applications, error: appError } = await supabase
        .from('campaign_applications')
        .select(`
          id, campaign_id, creator_id, intro_message, proposed_timeline,
          proposed_rate, status, created_at, updated_at,
          campaign:campaigns!inner(id, title, user_id, description, goals, style, tone, delivery_type, pricing_type, fixed_price, budget_min, budget_max, deliverables)
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (appError) throw appError;
      if (!applications || applications.length === 0) return [];

      // Step 2: Fetch business profiles for campaign owners
      const campaignUserIds = [...new Set(
        applications
          .map(a => (a.campaign as unknown as ApplicationCampaign)?.user_id)
          .filter(Boolean)
      )];

      const { data: businessProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, city, country')
        .in('user_id', campaignUserIds);

      if (profileError) throw profileError;

      // Build lookup map
      const profileMap = new Map(
        (businessProfiles || []).map(p => [p.user_id, p])
      );

      // Step 3: Merge
      return applications.map(app => {
        const campaign = app.campaign as unknown as ApplicationCampaign;
        const businessProfile = campaign ? profileMap.get(campaign.user_id) : undefined;

        return {
          id: app.id,
          campaign_id: app.campaign_id,
          creator_id: app.creator_id,
          intro_message: app.intro_message,
          proposed_timeline: app.proposed_timeline,
          proposed_rate: app.proposed_rate,
          status: app.status as CreatorApplication['status'],
          created_at: app.created_at,
          updated_at: app.updated_at,
          campaign,
          business_profile: businessProfile ? {
            business_name: businessProfile.business_name,
            logo_url: businessProfile.logo_url,
            city: businessProfile.city,
            country: businessProfile.country,
          } : undefined,
        };
      });
    },
    enabled: !!user?.id,
  });
};
