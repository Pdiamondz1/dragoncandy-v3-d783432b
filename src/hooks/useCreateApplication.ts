
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export const useCreateApplication = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  return useMutation({
    mutationFn: async ({
      campaignId,
      introMessage,
      proposedTimeline,
      proposedRate,
      portfolioFiles,
      relevantExperience,
    }: {
      campaignId: string;
      introMessage: string;
      proposedTimeline?: string;
      proposedRate?: number;
      portfolioFiles?: File[];
      relevantExperience?: string;
    }) => {
      console.log('Creating application:', { 
        campaignId, 
        introMessage, 
        proposedTimeline, 
        proposedRate,
        portfolioFiles: portfolioFiles?.length || 0,
        relevantExperience
      });
      
      // For now, we'll store the application without portfolio files
      // Portfolio integration with Supabase storage would be implemented in a future iteration
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
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      toast({
        title: 'Application submitted successfully!',
        description: 'The business owner will review your application.',
      });

      // Send email notification to campaign owner
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title, user_id, id')
          .eq('id', data.campaign_id)
          .single();

        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('creator_name')
          .eq('user_id', user!.id)
          .single();

        if (campaign && creatorProfile) {
          await sendNotification(
            'new_application',
            undefined,
            undefined,
            {
              recipientUserId: campaign.user_id,
              campaignTitle: campaign.title,
              campaignId: campaign.id,
              applicantName: creatorProfile.creator_name
            }
          );
        }
      } catch (error) {
        console.error('Failed to send notification email:', error);
      }
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
