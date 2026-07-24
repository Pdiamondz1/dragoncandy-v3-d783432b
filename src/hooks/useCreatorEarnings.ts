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
        // Earned = payout_pending_wallet (every payout now transits the wallet) + historical collaboration
        // transfer_created (direct-path payouts). payment_released is DROPPED — post wallet-first reroute it
        // fires on EVERY payout alongside payout_pending_wallet, so summing both would double-count. The
        // entity_id IN collabIds scoping already excludes the user-keyed wallet→Stripe flush transfer. §4.1.
        supabase
          .from('payment_events')
          .select('amount_cents')
          .in('entity_id', collabIds)
          .eq('entity_type', 'collaboration')
          .in('event_type', ['payout_pending_wallet', 'transfer_created']),
        supabase
          .from('payment_events')
          .select('amount_cents, campaign_id, event_type, created_at')
          .in('campaign_id', campaignIds)
          .in('event_type', ['escrow_held', 'escrow_authorized'])
          .order('created_at', { ascending: true }),
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

      // escrow_held is written without an amount by some flows; fall back to
      // the latest prior escrow_authorized for the same campaign.
      const escrowEvents = escrowResult.data ?? [];
      const resolveHeldAmount = (held: typeof escrowEvents[number]): number => {
        if (held.amount_cents != null) return held.amount_cents;
        const auths = escrowEvents.filter(a =>
          a.event_type === 'escrow_authorized' &&
          a.campaign_id === held.campaign_id &&
          a.amount_cents != null &&
          a.created_at <= held.created_at
        );
        return auths.length > 0 ? (auths[auths.length - 1].amount_cents ?? 0) : 0;
      };

      const inEscrow = escrowEvents
        .filter(e => e.event_type === 'escrow_held')
        .filter(e => !releasedCampaignIds.has(e.campaign_id))
        .reduce((sum, e) => sum + resolveHeldAmount(e), 0) / 100;

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
