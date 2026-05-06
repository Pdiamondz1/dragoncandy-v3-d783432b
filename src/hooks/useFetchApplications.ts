import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignApplication } from '@/types/applications';

export const useCampaignApplications = (campaignId: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-applications', campaignId],
    queryFn: async () => {
      if (!campaignId) {
        return [];
      }

      // First, get the applications
      const { data: applications, error: applicationsError } = await supabase
        .from('campaign_applications')
        .select('id, campaign_id, creator_id, intro_message, proposed_timeline, proposed_rate, status, created_at, updated_at, brand_approval_status, restaurant_approval_status, final_approval_status')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (applicationsError) {
        console.error('❌ useCampaignApplications: Error fetching applications:', applicationsError);
        throw applicationsError;
      }

      if (!applications || applications.length === 0) {
        return [];
      }

      const creatorIds = [...new Set(applications.map(app => app.creator_id).filter(Boolean))] as string[];

      const { data: creatorProfiles } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name, avatar_url, bio, skills')
        .in('user_id', creatorIds);

      const profileMap = new Map(
        (creatorProfiles || []).map(p => [p.user_id, p])
      );

      const fallbackProfile = {
        creator_name: 'Unknown Creator',
        avatar_url: null,
        bio: null,
        skills: [] as string[],
      };

      const enrichedApplications = applications.map(app => {
        const profile = profileMap.get(app.creator_id);
        return {
          ...app,
          creator_profile: profile
            ? {
                creator_name: profile.creator_name || 'Unknown Creator',
                avatar_url: profile.avatar_url || null,
                bio: profile.bio || null,
                skills: profile.skills || [],
              }
            : fallbackProfile,
        };
      });

      return enrichedApplications as CampaignApplication[];
    },
    enabled: !!campaignId && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
};

export const useCreatorApplications = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return [];
      }

      // Fetch applications with campaign data (without nested business_profile)
      const { data, error } = await supabase
        .from('campaign_applications')
        .select(`
          id, campaign_id, creator_id, intro_message, proposed_timeline, proposed_rate, status, created_at, updated_at, brand_approval_status, restaurant_approval_status, final_approval_status,
          campaign:campaigns!campaign_id (
            title,
            description,
            budget_min,
            budget_max,
            deadline,
            user_id
          )
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ useCreatorApplications: Error fetching creator applications:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Collect unique campaign owner IDs
      type CampaignJoin = { title: string; description: string | null; budget_min: number | null; budget_max: number | null; deadline: string | null; user_id: string };
      const getCampaign = (app: typeof data[0]): CampaignJoin | undefined => {
        const c = app.campaign;
        return Array.isArray(c) ? c[0] : (c as CampaignJoin | null) ?? undefined;
      };
      const campaignOwnerIds = [...new Set(
        data
          .map(app => getCampaign(app)?.user_id)
          .filter(Boolean)
      )] as string[];

      // Fetch all business profiles for these campaign owners in one query
      const { data: businessProfiles, error: businessError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, location, description')
        .in('user_id', campaignOwnerIds);

      if (businessError) {
        console.error('❌ useCreatorApplications: Error fetching business profiles:', businessError);
        // Don't throw - continue without business profiles
      }

      // Create a map for quick lookup
      const businessProfileMap = new Map(
        (businessProfiles || []).map(bp => [bp.user_id, bp])
      );

      // Fetch creator's own profile once and add it to all applications
      const { data: creatorProfile } = await supabase
        .from('creator_profiles')
        .select('creator_name, avatar_url, bio, skills')
        .eq('user_id', user.id)
        .single();

      // Add creator profile AND business profile to all applications
      const enrichedApplications = data.map(app => {
        const campaign = getCampaign(app);
        return {
          ...app,
          creator_profile: creatorProfile ? {
            creator_name: creatorProfile.creator_name || 'Creator',
            avatar_url: creatorProfile.avatar_url || null,
            bio: creatorProfile.bio || null,
            skills: creatorProfile.skills || [],
          } : {
            creator_name: 'Creator',
            avatar_url: null,
            bio: null,
            skills: [],
          },
          campaign: campaign ? {
            ...campaign,
            business_profile: campaign.user_id
              ? businessProfileMap.get(campaign.user_id) || undefined
              : undefined
          } : undefined
        };
      });

      return enrichedApplications as unknown as CampaignApplication[];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });
};
