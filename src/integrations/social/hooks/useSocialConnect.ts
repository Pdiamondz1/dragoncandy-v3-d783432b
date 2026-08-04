import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocialProxy } from '@/integrations/social/client';
import type { Platform, ProviderId, SocialAccount } from '@/integrations/social/contract';

export interface SyncConnectionsResult {
  /** Provider account ids newly recorded (or refreshed) as this user's rows. */
  recorded: string[];
  /** Platforms present at the provider but outside the 5 the contract models. */
  skipped: string[];
  /** Everything found in the tenant's provider profile. */
  accounts: SocialAccount[];
}

/**
 * The connect leg of the provider-agnostic seam: start an OAuth handoff, and
 * claim whatever came back once the provider redirects to our callback.
 *
 * `syncConnections` deliberately takes NO account id. The gateway derives the
 * tenant's provider profile from the session and records the accounts inside
 * it, so the callback page works without depending on which query params a
 * given provider happens to append to its redirect — the part of an OAuth
 * round-trip that is least documented and most likely to change.
 */
export function useSocialConnect() {
  const { call, session, orgUnitId } = useSocialProxy();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;

  const getConnectUrl = useCallback(
    (platform: Platform, redirectUri: string, provider?: ProviderId) =>
      call<{ url: string }>('getConnectUrl', { platform, redirectUri, provider }),
    [call],
  );

  const syncConnections = useCallback(
    async (provider?: ProviderId) => {
      const result = await call<SyncConnectionsResult>('syncConnections', { provider });
      await qc.invalidateQueries({ queryKey: ['social-accounts', userId, orgUnitId] });
      return result;
    },
    [call, qc, userId, orgUnitId],
  );

  return { getConnectUrl, syncConnections };
}
