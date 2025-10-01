
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  open_for_sponsorship?: boolean;
  created_at: string;
  updated_at: string;
}

export const useCampaignsList = () => {
  const { user } = useAuth();

  return useQuery({
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
};

export const useCampaignById = (id: string) => {
  return useQuery({
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
};
