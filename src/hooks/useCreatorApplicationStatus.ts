
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ApplicationStatus {
  hasApplied: boolean;
  applicationStatus: 'pending' | 'accepted' | 'rejected' | 'counter_offered' | null;
  applicationId: string | null;
  isLoading: boolean;
}

export const useCreatorApplicationStatus = (campaignId: string | undefined): ApplicationStatus => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['creator-application-status', campaignId, user?.id],
    queryFn: async () => {
      if (!campaignId || !user?.id) return null;

      const { data, error } = await supabase
        .from('campaign_applications')
        .select('id, status')
        .eq('campaign_id', campaignId)
        .eq('creator_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking application status:', error);
        return null;
      }

      return data;
    },
    enabled: !!campaignId && !!user?.id,
  });

  return {
    hasApplied: !!data,
    applicationStatus: data?.status as 'pending' | 'accepted' | 'rejected' | 'counter_offered' | null,
    applicationId: data?.id ?? null,
    isLoading,
  };
};
