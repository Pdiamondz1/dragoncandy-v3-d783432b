
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignApplication } from '@/types/applications';

export const useCampaignApplications = (campaignId: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-applications', campaignId],
    queryFn: async () => {
      console.log('📋 useCampaignApplications: Fetching applications for campaign:', campaignId);
      
      if (!campaignId) {
        console.warn('📋 useCampaignApplications: No campaignId provided');
        return [];
      }

      const { data, error } = await supabase
        .from('campaign_applications')
        .select(`
          *,
          creator_profiles!creator_id (
            creator_name,
            avatar_url,
            bio,
            skills
          )
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ useCampaignApplications: Error fetching campaign applications:', error);
        throw error;
      }

      console.log('📋 useCampaignApplications: Raw data received:', data);

      // Transform the data to match our interface
      const transformedData = data?.map((app: any) => ({
        ...app,
        creator_profile: app.creator_profiles ? {
          creator_name: app.creator_profiles.creator_name || '',
          avatar_url: app.creator_profiles.avatar_url || undefined,
          bio: app.creator_profiles.bio || undefined,
          skills: app.creator_profiles.skills || [],
        } : undefined,
      })) || [];

      console.log('✅ useCampaignApplications: Transformed applications:', transformedData);
      return transformedData as CampaignApplication[];
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
      console.log('🎨 useCreatorApplications: Fetching applications for creator:', user?.id);
      
      if (!user?.id) {
        console.warn('🎨 useCreatorApplications: No user ID provided');
        return [];
      }

      const { data, error } = await supabase
        .from('campaign_applications')
        .select(`
          *,
          campaigns!campaign_id (
            title,
            description,
            budget_min,
            budget_max,
            deadline
          )
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ useCreatorApplications: Error fetching creator applications:', error);
        throw error;
      }

      console.log('✅ useCreatorApplications: Fetched creator applications:', data);
      return data as CampaignApplication[];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });
};
