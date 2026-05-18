import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAgreedValue(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['agreed-value', campaignId],
    queryFn: async (): Promise<number | null> => {
      const { data: app } = await supabase
        .from('campaign_applications')
        .select('id, proposed_rate')
        .eq('campaign_id', campaignId!)
        .eq('status', 'accepted')
        .limit(1)
        .maybeSingle();

      if (!app) return null;

      const { data: counterOffer } = await supabase
        .from('application_counter_offers')
        .select('proposed_rate')
        .eq('application_id', app.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return counterOffer?.proposed_rate ?? app.proposed_rate ?? null;
    },
    enabled: !!campaignId,
    staleTime: 300_000,
  });
}
