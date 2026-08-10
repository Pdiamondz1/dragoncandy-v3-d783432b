import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorPayoutState {
  hasStripeAccount: boolean;
  onboardingComplete: boolean;
  pendingBalance: number;
  collaborationCount: number;
}

/**
 * The creator's payout readiness + activity volume.
 *
 * `.maybeSingle()` is load-bearing: three of the 18 creators on production
 * have no `creator_profiles` row at all. `.single()` throws on zero rows and
 * that error is indistinguishable from a real failure — a missing row
 * correctly means `hasStripeAccount: false`, not an error state.
 */
export function useCreatorPayoutState() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-payout-state', user?.id],
    queryFn: async (): Promise<CreatorPayoutState> => {
      // Independent reads — neither needs the other's result, so they go out
      // together. Sequencing them would add a full round-trip to the path that
      // gates the whole dashboard's loading state.
      const [{ data: cp, error }, { count, error: countError }] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('campaign_collaborations')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user!.id),
      ]);

      if (error) throw error;
      if (countError) throw countError;

      return {
        hasStripeAccount: !!cp?.stripe_account_id,
        onboardingComplete: cp?.stripe_onboarding_complete === true,
        pendingBalance: Number(cp?.pending_balance ?? 0),
        collaborationCount: count ?? 0,
      };
    },
    enabled: !!user,
  });
}
