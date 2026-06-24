import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SUPABASE_URL } from '@/integrations/supabase/client';

/**
 * Frontend client for the `social-proxy` contract-operation gateway.
 *
 * `social-proxy` is a single POST endpoint that dispatches by operation name:
 *   POST ${SUPABASE_URL}/functions/v1/social-proxy
 *   body: { op, args }
 *   headers: Authorization: Bearer <supabase access_token>, optional x-org-unit-id
 *   returns: { data } on HTTP 200, or { error, ... } on non-200.
 *
 * These hooks are headless (no UI) and dormant — built for the Phase-3 swap
 * from the Outstand SDK hooks to this provider-agnostic seam.
 */

export const SOCIAL_PROXY_URL = `${SUPABASE_URL}/functions/v1/social-proxy`;

export interface SocialProxyAuth {
  accessToken: string;
  orgUnitId?: string | null;
}

/**
 * Call a single `social-proxy` operation. Throws an `Error` carrying the
 * server `error` field on a non-2xx response; otherwise returns the `data`.
 */
export async function callSocialProxy<T>(
  op: string,
  args: object,
  opts: SocialProxyAuth,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.accessToken}`,
  };
  if (opts.orgUnitId) {
    headers['x-org-unit-id'] = opts.orgUnitId;
  }

  const res = await fetch(SOCIAL_PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ op, args }),
  });

  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (!res.ok) {
    const message =
      (body && typeof body.error === 'string' && body.error) ||
      body?.message ||
      `social-proxy "${op}" failed (${res.status})`;
    throw new Error(message);
  }

  return body.data as T;
}

/**
 * Read auth/org context once and return a bound `call(op, args)` so the
 * domain hooks don't each re-wire `useAuth()`.
 */
export function useSocialProxy() {
  const { session, activeOrgUnit } = useAuth();
  const accessToken = session?.access_token ?? '';
  const orgUnitId = activeOrgUnit?.id ?? null;

  const call = useCallback(
    <T>(op: string, args: object = {}): Promise<T> =>
      callSocialProxy<T>(op, args, { accessToken, orgUnitId }),
    [accessToken, orgUnitId],
  );

  return { call, session, accessToken, orgUnitId };
}
