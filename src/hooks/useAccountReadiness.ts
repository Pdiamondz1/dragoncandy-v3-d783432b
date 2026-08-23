import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import type { PayoutStatusData } from '@/lib/readiness';
import {
  computeAccountReadiness,
  type AccountReadiness,
  type AccountRole,
  type ReadinessContext,
  type RequirementKey,
  type StripeFacts,
} from '@/lib/accountReadiness';

interface Options {
  /**
   * true  → the live Stripe edge function (authoritative, costs a Stripe API call).
   * false → the mirrored stripe_onboarding_complete column (cheap, may lag a webhook).
   *
   * The split is by consequence: a checklist that is briefly stale is harmless,
   * a gate that is stale costs money. See spec §5.2.
   *
   * The live query shares the exact ['payout-status', role, orgUnitId] cache key
   * used by useTransactionReadiness / StripeConnectSetup's invalidation, so it MUST
   * cache the same PayoutStatusData shape those consumers write — two different
   * shapes under one key is a last-write-wins corruption trap. StripeFacts is
   * derived from it locally, never cached under this key.
   */
  liveStripe?: boolean;
  enabled?: boolean;
}

export type UseAccountReadiness = AccountReadiness & {
  dismiss: (key: RequirementKey) => void;
};

export function useAccountReadiness(role: AccountRole, opts: Options = {}): UseAccountReadiness {
  const { liveStripe = false, enabled = true } = opts;
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const isCreator = role === 'content_creator';
  const table = isCreator ? 'creator_profiles' : 'business_profiles';
  const payoutRole = isCreator ? 'creator' : 'business';

  const detail = useQuery({
    queryKey: ['account-readiness-detail', userId, role],
    queryFn: async () => {
      const [{ data: prof }, { data: roleProfile }, { count: memberCount }] = await Promise.all([
        supabase.from('profiles')
          .select('email_verified, phone_verified_at, dismissed_requirements, org_id')
          .eq('id', userId!).maybeSingle(),
        supabase.from(table)
          .select(isCreator
            ? 'creator_name, avatar_url, bio, skills, portfolio_urls, stripe_account_id, stripe_onboarding_complete'
            : 'business_name, logo_url, stripe_account_id, stripe_onboarding_complete')
          .eq('user_id', userId!).maybeSingle(),
        supabase.from('org_members')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', profile?.org_id ?? '00000000-0000-0000-0000-000000000000')
          .eq('invitation_status', 'active'),
      ]);
      return { prof, roleProfile, memberCount: memberCount ?? undefined };
    },
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });

  // Shares the ['payout-status', role, orgUnitId] key with useTransactionReadiness
  // and StripeConnectSetup's invalidateQueries — so it caches the full
  // PayoutStatusData shape those consumers expect, not a narrowed one.
  const liveStripeQuery = useQuery({
    queryKey: ['payout-status', payoutRole, null],
    queryFn: async (): Promise<PayoutStatusData> => {
      const fn = isCreator ? 'check-creator-payout-status' : 'check-restaurant-payout-status';
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      return data as PayoutStatusData;
    },
    enabled: enabled && !!userId && liveStripe,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: orgUnits } = useOrgUnits(profile?.org_id);
  const { data: socialAccounts } = useLocationSocialAccounts(userId, null);

  const readiness = useMemo<AccountReadiness>(() => {
    const prof = detail.data?.prof as Record<string, unknown> | null | undefined;
    const rp = detail.data?.roleProfile as Record<string, unknown> | null | undefined;

    // Mirrored Stripe facts, used when liveStripe is false.
    const mirrored: StripeFacts | undefined = rp
      ? {
          hasAccount: !!rp.stripe_account_id,
          onboardingComplete: !!rp.stripe_onboarding_complete,
        }
      : undefined;

    // Live Stripe facts are narrowed from the shared PayoutStatusData shape down
    // to the two fields the readiness engine cares about, only after the query
    // has actually resolved.
    const live: StripeFacts | undefined = liveStripeQuery.data
      ? {
          hasAccount: liveStripeQuery.data.hasAccount,
          onboardingComplete: liveStripeQuery.data.onboardingComplete,
        }
      : undefined;

    const ctx: ReadinessContext = {
      role,
      emailVerified: prof ? !!prof.email_verified : undefined,
      displayName: rp ? ((rp.creator_name ?? rp.business_name) as string | null) : undefined,
      imageUrl: rp ? ((rp.avatar_url ?? rp.logo_url) as string | null) : undefined,
      phoneVerifiedAt: prof ? ((prof.phone_verified_at ?? null) as string | null) : undefined,
      // An unreadable dismissal list means "nothing dismissed": showing a
      // dismissed recommendation is a small annoyance, hiding a real one is worse.
      dismissed: (prof?.dismissed_requirements as string[] | null) ?? [],
      orgUnits: orgUnits?.map((u) => ({
        id: u.id, address: u.address, lat: u.lat, lng: u.lng, isPrimary: u.is_primary,
      })),
      orgMemberCount: detail.data?.memberCount,
      stripe: liveStripe ? live : mirrored,
      socialActiveCount: socialAccounts?.length,
      creator: isCreator && rp
        ? {
            skills: (rp.skills as string[] | null) ?? null,
            bio: (rp.bio as string | null) ?? null,
            portfolioUrls: (rp.portfolio_urls as string[] | null) ?? null,
          }
        : undefined,
    };
    return computeAccountReadiness(ctx);
  }, [role, isCreator, liveStripe, detail.data, liveStripeQuery.data, orgUnits, socialAccounts]);

  const dismiss = useCallback(
    (key: RequirementKey) => {
      if (!userId) return;
      const current = ((detail.data?.prof as Record<string, unknown> | undefined)
        ?.dismissed_requirements as string[] | null) ?? [];
      if (current.includes(key)) return;
      void supabase
        .from('profiles')
        .update({ dismissed_requirements: [...current, key] })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) { console.error('Failed to dismiss requirement:', error); return; }
          void queryClient.invalidateQueries({ queryKey: ['account-readiness-detail', userId, role] });
        });
    },
    [userId, role, detail.data, queryClient],
  );

  return { ...readiness, dismiss };
}
