
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface CampaignApplication {
  id: string;
  campaign_id: string;
  creator_id: string;
  intro_message?: string;
  proposed_timeline?: string;
  proposed_rate?: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  // Joined data
  creator_profile?: {
    creator_name: string;
    avatar_url?: string;
    bio?: string;
    skills?: string[];
  };
  campaign?: {
    title: string;
    description?: string;
  };
}

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
          profiles!creator_id (
            creator_profiles!user_id (
              creator_name,
              avatar_url,
              bio,
              skills
            )
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
        creator_profile: app.profiles?.creator_profiles ? {
          creator_name: app.profiles.creator_profiles.creator_name || '',
          avatar_url: app.profiles.creator_profiles.avatar_url || undefined,
          bio: app.profiles.creator_profiles.bio || undefined,
          skills: app.profiles.creator_profiles.skills || [],
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

export const useCreateApplication = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      introMessage,
      proposedTimeline,
      proposedRate,
    }: {
      campaignId: string;
      introMessage: string;
      proposedTimeline?: string;
      proposedRate?: number;
    }) => {
      console.log('Creating application:', { campaignId, introMessage, proposedTimeline, proposedRate });
      
      const { data, error } = await supabase
        .from('campaign_applications')
        .insert({
          campaign_id: campaignId,
          creator_id: user!.id,
          intro_message: introMessage,
          proposed_timeline: proposedTimeline,
          proposed_rate: proposedRate,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating application:', error);
        throw error;
      }

      console.log('Created application:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({
        title: 'Application submitted successfully!',
        description: 'The business owner will review your application.',
      });
    },
    onError: (error) => {
      console.error('Application submission failed:', error);
      toast({
        title: 'Failed to submit application',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useManageApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      status,
    }: {
      applicationId: string;
      status: 'accepted' | 'rejected';
    }) => {
      console.log('Updating application status:', { applicationId, status });
      
      const { data, error } = await supabase
        .from('campaign_applications')
        .update({ status })
        .eq('id', applicationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating application:', error);
        throw error;
      }

      // If accepted, create collaboration record
      if (status === 'accepted') {
        const { error: collaborationError } = await supabase
          .from('campaign_collaborations')
          .insert({
            campaign_id: data.campaign_id,
            creator_id: data.creator_id,
            application_id: data.id,
            status: 'active',
          });

        if (collaborationError) {
          console.error('Error creating collaboration:', collaborationError);
          throw collaborationError;
        }
      }

      console.log('Updated application:', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      
      toast({
        title: `Application ${data.status}!`,
        description: data.status === 'accepted' 
          ? 'A new collaboration has been created.' 
          : 'The creator has been notified.',
      });
    },
    onError: (error) => {
      console.error('Application management failed:', error);
      toast({
        title: 'Failed to update application',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
