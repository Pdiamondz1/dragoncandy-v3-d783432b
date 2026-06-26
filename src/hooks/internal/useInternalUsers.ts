import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type InternalTier = 'admin' | 'stakeholder';

export interface InternalUser {
  user_id: string;
  email: string;
  full_name: string | null;
  /** Effective tier — 'admin' wins when a user holds both roles. */
  tier: InternalTier;
  roles: InternalTier[];
  status: 'invited' | 'active';
  invited_at: string | null;
  last_sign_in_at: string | null;
}

export interface InviteResult {
  status: 'invited' | 'granted' | 'already_has_access';
  user_id: string;
  tier: InternalTier;
  /** Present for 'invited'/'granted'; false means the email send failed. */
  email_sent?: boolean;
}

/**
 * Calls the admin-gated manage-internal-users edge function. Uses a raw fetch with
 * the session bearer + anon apikey (the function runs verify_jwt=false and does its
 * own admin check) — mirrors useCommitWikiPr.
 */
async function callManageInternalUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-internal-users`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    },
  );

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & T;
  if (!res.ok) {
    const msg = (data?.message ?? data?.error) as string | undefined;
    throw new Error(typeof msg === 'string' ? msg : 'Request failed');
  }
  return data as T;
}

/** Internal-only users (admin/stakeholder), enriched server-side with auth status. */
export function useInternalUsers() {
  return useQuery({
    queryKey: ['aios', 'internal-users'],
    queryFn: () =>
      callManageInternalUsers<{ users: InternalUser[] }>({ action: 'list' }).then((r) => r.users),
  });
}

/** Invite (or grant access to) an internal user by email. */
export function useInviteInternalUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; full_name?: string; tier: InternalTier }) =>
      callManageInternalUsers<InviteResult>({ action: 'invite', ...vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aios', 'internal-users'] }),
  });
}

/** Revoke all AIOS access (admin + stakeholder roles) for a user. */
export function useRevokeInternalUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      callManageInternalUsers<{ status: 'revoked'; user_id: string }>({
        action: 'revoke',
        user_id: userId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aios', 'internal-users'] }),
  });
}
