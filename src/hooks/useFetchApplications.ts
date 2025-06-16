
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignApplication } from '@/types/applications';

export const useCampaignApplications = (campaignId: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-applications', campaignId],
    queryFn: async () => {
      console.log('Fetching applications for campaign:', campaignId);
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
        console.error('Error fetching campaign applications:', error);
        throw error;
      }

      console.log('Raw campaign applications data:', data);

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

      console.log('Transformed campaign applications:', transformedData);
      return transformedData as CampaignApplication[];
    },
    enabled: !!campaignId && !!user,
  });
};

export const useCreatorApplications = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-applications', user?.id],
    queryFn: async () => {
      console.log('Fetching applications for creator:', user?.id);
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
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching creator applications:', error);
        throw error;
      }

      console.log('Fetched creator applications:', data);
      return data as CampaignApplication[];
    },
    enabled: !!user,
  });
};
