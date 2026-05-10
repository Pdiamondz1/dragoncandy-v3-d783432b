import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useApplicationCollaboration(applicationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['application-collaboration', applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select('id, status, content_status')
        .eq('application_id', applicationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!applicationId && enabled,
    staleTime: 30_000,
  });
}
