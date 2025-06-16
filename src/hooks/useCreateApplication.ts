
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

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
