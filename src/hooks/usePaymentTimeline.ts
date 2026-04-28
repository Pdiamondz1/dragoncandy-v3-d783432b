import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentEvent {
  id: string;
  event_type: string;
  entity_type: 'collaboration' | 'sponsorship';
  entity_id: string;
  campaign_id: string;
  actor_id: string | null;
  actor_role: string;
  amount_cents: number | null;
  currency: string;
  stripe_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function usePaymentTimeline(
  entityType: 'collaboration' | 'sponsorship',
  entityId: string | undefined,
) {
  return useQuery({
    queryKey: ['payment-timeline', entityType, entityId],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!entityId) return [];

      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!entityId,
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
}

export function usePaymentTimelineByCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['payment-timeline-campaign', campaignId],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!campaignId) return [];

      const { data, error } = await supabase
        .from('payment_events')
        .select('id, event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, amount_cents, currency, stripe_id, metadata, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
    enabled: !!campaignId,
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
}
