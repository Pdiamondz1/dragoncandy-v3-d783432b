import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useReconnectNeeded } from '@/hooks/outstand/useReconnectNeeded';
import { deriveReadiness, type PayoutStatusData, type ReadinessResult } from '@/lib/readiness';

export type ReadinessRole = 'creator' | 'business';

export interface UseTransactionReadinessOpts {
  requireStripe?: boolean;
  requireSocial?: boolean;
  orgUnitId?: string | null;
  enabled?: boolean;
}

export interface TransactionReadiness extends ReadinessResult {
  refetch: () => Promise<void>;
}

export function useTransactionReadiness(
  role: ReadinessRole,
  opts: UseTransactionReadinessOpts = {},
): TransactionReadiness {
  const { user } = useAuth();
  const { requireStripe = true, requireSocial = false, orgUnitId = null, enabled = true } = opts;
  const queryClient = useQueryClient();
  const statusFn = role === 'creator' ? 'check-creator-payout-status' : 'check-restaurant-payout-status';

  const stripeQuery = useQuery({
    queryKey: ['payout-status', role, orgUnitId],
    queryFn: async (): Promise<PayoutStatusData> => {
      const params = orgUnitId ? `?org_unit_id=${orgUnitId}` : '';
      const { data, error } = await supabase.functions.invoke(`${statusFn}${params}`);
      if (error) throw error;
      return data as PayoutStatusData;
    },
    enabled: enabled && !!user && requireStripe,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // useLocationSocialAccounts returns a React Query result; destructure .data
  const { data: socialAccounts = [] } = useLocationSocialAccounts(user?.id, orgUnitId);

  // useReconnectNeeded returns a React Query result; the array is on .data
  // Elements are { platform: string; platformHandle: string | null } — matches ReconnectNeededPlatform
  const { data: reconnectNeeded = [] } = useReconnectNeeded(user?.id);

  const result = deriveReadiness({
    require: { stripe: requireStripe, social: requireSocial },
    stripeQuery: { isLoading: stripeQuery.isLoading, isError: stripeQuery.isError, data: stripeQuery.data },
    socialHasActive: (socialAccounts?.length ?? 0) > 0,
    socialReconnectNeeded: reconnectNeeded,
    previousAccountId: null,
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['payout-status', role, orgUnitId] });
  }, [queryClient, role, orgUnitId]);

  return { ...result, refetch };
}
