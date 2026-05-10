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
      const [payoutEventsResult, escrowResult, payoutStatusResult] = await Promise.all([
        supabase
          .from('payment_events')
          .select('amount_cents')
          .eq('actor_id', userId!)
          .in('event_type', ['payment_released', 'payout_pending_wallet']),
        supabase
          .from('payment_events')
          .select('amount_cents')
          .eq('event_type', 'escrow_held')
          .eq('actor_id', userId!),
        supabase.functions.invoke('check-creator-payout-status'),
      ]);

      const totalEarned = (payoutEventsResult.data || []).reduce(
        (sum, e) => sum + (e.amount_cents || 0), 0
      ) / 100;

      const inEscrow = (escrowResult.data || []).reduce(
        (sum, e) => sum + (e.amount_cents || 0), 0
      ) / 100;

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
