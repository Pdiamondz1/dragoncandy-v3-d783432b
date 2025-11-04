
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { Campaign } from './useCampaignQueries';

export interface CreateCampaignData {
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  style?: string;
  tone?: string;
  status?: 'draft' | 'published';
  open_for_sponsorship?: boolean;
}

export const useCreateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignData: CreateCampaignData) => {
      console.log('Creating campaign:', campaignData);
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          ...campaignData,
          user_id: user!.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating campaign:', error);
        throw error;
      }

      console.log('Created campaign:', data);
      return data as Campaign;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Send email notification if campaign is published
      if (data.status === 'published') {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', user!.id)
            .single();

          if (profile) {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: profile.email,
                recipientName: profile.full_name,
                type: 'campaign_published',
                data: {
                  campaignTitle: data.title,
                  campaignId: data.id,
                },
              },
            });
          }
        } catch (error) {
          console.error('Failed to send campaign published email:', error);
        }
      }
      
      toast({
        title: 'Campaign created successfully!',
        description: `"${data.title}" has been ${data.status === 'published' ? 'published' : 'saved as draft'}.`,
      });
    },
    onError: (error) => {
      console.error('Campaign creation failed:', error);
      toast({
        title: 'Failed to create campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateCampaignData> }) => {
      console.log('Updating campaign:', id, updates);
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating campaign:', error);
        throw error;
      }

      console.log('Updated campaign:', data);
      return data as Campaign;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Send email notification if status was changed
      if (variables.updates.status) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', user.id)
            .single();

          if (profile) {
            const statusMessages: Record<string, string> = {
              published: 'Your campaign has been published and is now live in the marketplace!',
              active: 'Your campaign is now active with accepted creators working on it.',
              completed: 'Your campaign has been marked as completed.',
              cancelled: 'Your campaign has been cancelled.',
              draft: 'Your campaign has been saved as a draft.',
            };

            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: profile.email,
                recipientName: profile.full_name,
                type: data.status === 'published' ? 'campaign_published' : 'campaign_update',
                data: {
                  campaignTitle: data.title,
                  campaignId: data.id,
                  updateDetails: statusMessages[data.status as string] || `Campaign status updated to ${data.status}`,
                },
              },
            });
          }
        } catch (error) {
          console.error('Failed to send campaign status update email:', error);
        }
      }
      
      toast({
        title: 'Campaign updated successfully!',
        description: `"${data.title}" has been updated.`,
      });
    },
    onError: (error) => {
      console.error('Campaign update failed:', error);
      toast({
        title: 'Failed to update campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log('Deleting campaign:', id);
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting campaign:', error);
        throw error;
      }

      console.log('Deleted campaign:', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Campaign deleted successfully!',
      });
    },
    onError: (error) => {
      console.error('Campaign deletion failed:', error);
      toast({
        title: 'Failed to delete campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
