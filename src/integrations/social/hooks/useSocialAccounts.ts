import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocialProxy } from '@/integrations/social/client';
import type { SocialAccount } from '@/integrations/social/contract';

/**
 * Headless replacement for the Outstand SDK `useAccounts` hook, over the
 * provider-agnostic `social-proxy` gateway. Returns the connected accounts plus
 * a `disconnect` mutation that invalidates the list on success.
 *
 * Dormant until Phase 3 swaps it in for the SDK hook.
 */
export function useSocialAccounts() {
  const { call, session, orgUnitId } = useSocialProxy();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: ['social-accounts', userId, orgUnitId],
    queryFn: () => call<SocialAccount[]>('listAccounts', {}),
    enabled: !!session,
  });

  const disconnect = useMutation({
    mutationFn: (accountId: string) => call<void>('disconnect', { accountId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-accounts', userId, orgUnitId] });
    },
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    disconnect,
  };
}
