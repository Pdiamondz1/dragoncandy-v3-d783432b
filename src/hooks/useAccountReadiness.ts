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
   * used by StripeConnectSetup's invalidation, so it MUST cache the same
   * PayoutStatusData shape that consumer writes — two different shapes under
   * one key is a last-write-wins corruption trap. StripeFacts is derived from
   * it locally, never cached under this key.
   */
  liveStripe?: boolean;
  enabled?: boolean;
}

export type UseAccountReadiness = AccountReadiness & {
  dismiss: (key: RequirementKey) => void;
};

export interface AccountReadinessDetail {
  prof: Record<string, unknown> | null | undefined;
  roleProfile: Record<string, unknown> | null | undefined;
  memberCount: number | undefined;
}

/**
 * Fetches the three facts `useAccountReadiness` cannot get from an existing hook:
 * the profile row, the role-specific profile row, and the org's active member
 * count. Extracted from the hook so it can be exercised directly in a test
 * without going through React Query / renderHook.
 *
 * `orgId` MUST be `undefined` when the caller has not yet resolved it (e.g.
 * `useAuth().profile` loads asynchronously after `user`). There is no sentinel
 * org id: querying with a fake id would return a definitive (and wrong) zero
 * count instead of leaving the fact unknown.
 */
export async function fetchAccountReadinessDetail(
  userId: string,
  table: 'creator_profiles' | 'business_profiles',
  isCreator: boolean,
  orgId: string | undefined,
): Promise<AccountReadinessDetail> {
  const [profResult, roleResult] = await Promise.all([
    supabase.from('profiles')
      .select('email_verified, phone_verified_at, dismissed_requirements, org_id')
      .eq('id', userId).maybeSingle(),
    // identity_verified_at / stripe_requirements_due / stripe_disabled_reason exist on
    // BOTH role tables (Task 3). address_verified_at exists on creator_profiles only —
    // a business/brand's address lives per-location on org_units instead (see
    // OrgUnitFacts.addressVerifiedAt), so it is never selected here for that table.
    supabase.from(table)
      .select(isCreator
        ? 'creator_name, avatar_url, bio, skills, portfolio_urls, stripe_account_id, stripe_onboarding_complete, identity_verified_at, stripe_requirements_due, stripe_disabled_reason, address_verified_at'
        : 'business_name, logo_url, stripe_account_id, stripe_onboarding_complete, identity_verified_at, stripe_requirements_due, stripe_disabled_reason')
      .eq('user_id', userId).maybeSingle(),
  ]);

  if (profResult.error) {
    console.error('useAccountReadiness: failed to load profile', profResult.error);
  }
  if (roleResult.error) {
    console.error('useAccountReadiness: failed to load role profile', roleResult.error);
  }

  // Only run the count when we actually know the org — never substitute a
  // sentinel id. A read we didn't attempt must stay `undefined`, not a fact.
  let memberCount: number | undefined;
  if (orgId) {
    const { count, error } = await supabase.from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('invitation_status', 'active');
    if (error) {
      console.error('useAccountReadiness: failed to load org member count', error);
    } else {
      memberCount = count ?? undefined;
    }
  }

  return {
    prof: profResult.error ? undefined : (profResult.data as Record<string, unknown> | null),
    roleProfile: roleResult.error ? undefined : (roleResult.data as Record<string, unknown> | null),
    memberCount,
  };
}

export function useAccountReadiness(role: AccountRole, opts: Options = {}): UseAccountReadiness {
  const { liveStripe = false, enabled = true } = opts;
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const orgId = profile?.org_id;

  const isCreator = role === 'content_creator';
  const table = isCreator ? 'creator_profiles' : 'business_profiles';
  const payoutRole = isCreator ? 'creator' : 'business';

  // orgId is part of the key: a read taken before it resolved must never be
  // served (or invalidated together with) a read taken after it resolved —
  // they are answers to different questions.
  const detailQueryKey = ['account-readiness-detail', userId, role, orgId] as const;

  const detail = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => fetchAccountReadinessDetail(userId!, table, isCreator, orgId),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });

  // Shares the ['payout-status', role, orgUnitId] key with StripeConnectSetup's
  // invalidateQueries — so it caches the full PayoutStatusData shape that
  // consumer expects, not a narrowed one.
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

  const { data: orgUnits } = useOrgUnits(orgId);
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
        addressVerifiedAt: u.address_verified_at,
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
      // A role table with no row yet (rp undefined) means the read never resolved —
      // undefined, never a fabricated "not verified". Once rp resolves, missing
      // columns read as null (Stripe has never reported), which is a real `unmet`.
      identity: rp
        ? {
            verifiedAt: (rp.identity_verified_at ?? null) as string | null,
            requirementsDue: (rp.stripe_requirements_due ?? []) as readonly string[],
            disabledReason: (rp.stripe_disabled_reason ?? null) as string | null,
          }
        : undefined,
      // Creator-only fact — business/brand address comes from orgUnits above.
      addressVerifiedAt: isCreator && rp ? ((rp.address_verified_at ?? null) as string | null) : undefined,
    };
    return computeAccountReadiness(ctx);
  }, [role, isCreator, liveStripe, detail.data, liveStripeQuery.data, orgUnits, socialAccounts]);

  const dismiss = useCallback(
    (key: RequirementKey) => {
      if (!userId) return;
      const current = ((detail.data?.prof as Record<string, unknown> | undefined)
        ?.dismissed_requirements as string[] | null) ?? [];
      if (current.includes(key)) return;
      // The Supabase query builder's `.then()` returns `PromiseLike<void>`, not a
      // full Promise (no `.catch`), so a thrown-before-resolving failure (network
      // drop, not just a returned `error`) is wrapped in try/catch instead.
      void (async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ dismissed_requirements: [...current, key] })
            .eq('id', userId);
          if (error) { console.error('Failed to dismiss requirement:', error); return; }
          // Recomputed rather than closing over the outer `detailQueryKey` array
          // (a fresh reference every render) — keeps this callback's own
          // identity stable across renders where userId/role/orgId don't change.
          void queryClient.invalidateQueries({ queryKey: ['account-readiness-detail', userId, role, orgId] });
        } catch (err) {
          console.error('Failed to dismiss requirement:', err);
        }
      })();
    },
    [userId, role, orgId, detail.data, queryClient],
  );

  return useMemo(() => ({ ...readiness, dismiss }), [readiness, dismiss]);
}
