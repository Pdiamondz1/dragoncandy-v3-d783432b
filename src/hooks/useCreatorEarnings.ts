import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CreatorEarningsSummary {
  totalEarned: number;
  inEscrow: number;
  available: number;
  onboardingComplete: boolean;
}

export function useCreatorEarnings(userId: string | undefined) {
  return useQuery<CreatorEarningsSummary>({
    queryKey: ['creator-earnings-summary', userId],
    queryFn: async () => {
      const { data: collabs } = await supabase
        .from('campaign_collaborations')
        .select('id, campaign_id')
        .eq('creator_id', userId!);

      const collabIds = (collabs ?? []).map(c => c.id);
      const campaignIds = (collabs ?? []).map(c => c.campaign_id);

      if (collabIds.length === 0) {
        const payoutStatus = await supabase.functions.invoke('check-creator-payout-status');
        return {
          totalEarned: 0,
          inEscrow: 0,
          available: payoutStatus.data?.platformPendingBalance ?? 0,
          onboardingComplete: payoutStatus.data?.onboardingComplete ?? false,
        };
      }

      const [earnedResult, escrowResult, releasedResult, payoutStatusResult] = await Promise.all([
        supabase
          .from('payment_events')
          .select('amount_cents')
          .in('entity_id', collabIds)
          .eq('entity_type', 'collaboration')
          .in('event_type', ['payment_released', 'payout_pending_wallet']),
        supabase
          .from('payment_events')
          .select('amount_cents, campaign_id')
          .in('campaign_id', campaignIds)
          .eq('event_type', 'escrow_held'),
        supabase
          .from('payment_events')
          .select('campaign_id')
          .in('campaign_id', campaignIds)
          .in('event_type', ['payment_released', 'payout_pending_wallet']),
        supabase.functions.invoke('check-creator-payout-status'),
      ]);

      const releasedCampaignIds = new Set(
        (releasedResult.data ?? []).map(e => e.campaign_id)
      );

      const totalEarned = (earnedResult.data ?? []).reduce(
        (sum, e) => sum + (e.amount_cents ?? 0), 0
      ) / 100;

      const inEscrow = (escrowResult.data ?? [])
        .filter(e => !releasedCampaignIds.has(e.campaign_id))
        .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0) / 100;

      const payoutStatus = payoutStatusResult.data;

      return {
        totalEarned,
        inEscrow,
        available: payoutStatus?.platformPendingBalance ?? 0,
        onboardingComplete: payoutStatus?.onboardingComplete ?? false,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
