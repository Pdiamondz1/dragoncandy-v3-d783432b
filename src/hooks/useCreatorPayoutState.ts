import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorPayoutState {
  hasStripeAccount: boolean;
  onboardingComplete: boolean;
  pendingBalance: number;
  /** EVERY collaboration, any status, for all time — "has this creator ever
   *  worked or earned". Ranks payout above the rest. */
  collaborationCount: number;
  /** Only `status='active'` — "is anything in flight RIGHT NOW". Suppresses the
   *  "nothing on your plate" nudge.
   *
   *  These are two counts on purpose. One number cannot answer both questions:
   *  on prod 11 of 16 collaborations are `completed`, so a lifetime count says
   *  "in flight" about work that finished, and a creator who wrapped up their
   *  last campaign would never be told to go find the next one. A gate must be
   *  about the same thing as the claim it licenses. */
  activeCollaborationCount: number;
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
      const [
        { data: cp, error },
        { count, error: countError },
        { count: activeCount, error: activeError },
      ] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('campaign_collaborations')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user!.id),
        // Counted server-side rather than derived from the content-todo hook:
        // that hook pins `content_status='pending'` too, so a collaboration
        // sitting at `submitted` is genuinely in flight but produces no row —
        // deriving from it would under-suppress the nudge.
        supabase
          .from('campaign_collaborations')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user!.id)
          .eq('status', 'active'),
      ]);

      if (error) throw error;
      if (countError) throw countError;
      if (activeError) throw activeError;

      return {
        hasStripeAccount: !!cp?.stripe_account_id,
        onboardingComplete: cp?.stripe_onboarding_complete === true,
        pendingBalance: Number(cp?.pending_balance ?? 0),
        collaborationCount: count ?? 0,
        activeCollaborationCount: activeCount ?? 0,
      };
    },
    enabled: !!user,
  });
}
