
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Campaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  style?: string;
  tone?: string;
  created_at: string;
  updated_at: string;
}

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
}

export const useCampaigns = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns', user?.id],
    queryFn: async () => {
      console.log('Fetching campaigns for user:', user?.id);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching campaigns:', error);
        throw error;
      }

      console.log('Fetched campaigns:', data);
      return data as Campaign[];
    },
    enabled: !!user,
  });

  const createCampaign = useMutation({
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
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

  const updateCampaign = useMutation({
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
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

  const deleteCampaign = useMutation({
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

  return {
    campaigns: campaigns || [],
    isLoading,
    error,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  };
};

export const useCampaign = (id: string) => {
  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      console.log('Fetching campaign:', id);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching campaign:', error);
        throw error;
      }

      console.log('Fetched campaign:', data);
      return data as Campaign;
    },
    enabled: !!id,
  });

  return {
    campaign,
    isLoading,
    error,
  };
};
