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
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (applicationsError) {
        console.error('❌ useCampaignApplications: Error fetching applications:', applicationsError);
        throw applicationsError;
      }

      if (!applications || applications.length === 0) {
        return [];
      }

      // Get creator profile data for each application
      const enrichedApplications = await Promise.all(
        applications.map(async (app) => {
          try {
            const { data: creatorProfile, error: profileError } = await supabase
              .from('creator_profiles')
              .select('creator_name, avatar_url, bio, skills')
              .eq('user_id', app.creator_id)
              .single();

            if (profileError) {
              // Return application without profile data
              return {
                ...app,
                creator_profile: {
                  creator_name: 'Unknown Creator',
                  avatar_url: null,
                  bio: 'Profile not available',
                  skills: [],
                }
              };
            }

            return {
              ...app,
              creator_profile: {
                creator_name: creatorProfile.creator_name || 'Unknown Creator',
                avatar_url: creatorProfile.avatar_url || null,
                bio: creatorProfile.bio || null,
                skills: creatorProfile.skills || [],
              }
            };
          } catch (error) {
            console.error('❌ useCampaignApplications: Error enriching application:', error);
            // Return basic application data as fallback
            return {
              ...app,
              creator_profile: {
                creator_name: 'Creator Profile Error',
                avatar_url: null,
                bio: 'Unable to load profile',
                skills: [],
              }
            };
          }
        })
      );

      return enrichedApplications as CampaignApplication[];
    },
    enabled: !!campaignId && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Refetch every 30 seconds to catch new applications
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
          *,
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
      const campaignOwnerIds = [...new Set(
        data
          .map(app => app.campaign?.user_id)
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
      const enrichedApplications = data.map(app => ({
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
        campaign: app.campaign ? {
          ...app.campaign,
          business_profile: app.campaign.user_id 
            ? businessProfileMap.get(app.campaign.user_id) || undefined
            : undefined
        } : undefined
      }));

      return enrichedApplications as CampaignApplication[];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });
};
