import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { OrgMember, OrgRole } from '@/types/org';

type InviteResult = {
  email: string;
  status: 'sent' | 'failed' | 'already_member';
  error?: string;
};

type MemberRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  invitation_status: 'invited' | 'active' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function mapRowToMember(row: MemberRow): OrgMember {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    role: row.role,
    invited_by: row.invited_by,
    invitation_status: row.invitation_status,
    invited_at: row.invited_at,
    joined_at: row.joined_at,
    last_active_at: row.last_active_at,
    full_name: row.full_name,
    email: row.email ?? undefined,
    avatar_url: row.avatar_url,
  };
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async (): Promise<OrgMember[]> => {
      if (!orgId) return [];

      // `profiles.email` is not client-select-granted at the table/column level
      // (see 20260824140000_profiles_select_column_lockdown.sql) -- a direct
      // `.from('org_members').select('...profiles!fkey(email)')` embed can no longer
      // reach it. get_org_members_roster is a SECURITY DEFINER RPC scoped to orgs the
      // caller is an ACTIVE member of; it reads profiles.email with the function
      // owner's privileges, not the caller's grants.
      const { data, error } = await supabase.rpc(
        'get_org_members_roster' as never,
        { p_org_id: orgId } as never
      );

      if (error) throw error;

      return ((data ?? []) as unknown as MemberRow[]).map(mapRowToMember);
    },
    enabled: !!orgId,
  });
}

export function useUpdateMemberRole(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: OrgRole }) => {
      const { error } = await supabase
        .from('org_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => { toast.error('Failed to update member role'); },
  });
}

export function useRemoveMember(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('org_members')
        .update({ invitation_status: 'suspended' })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => { toast.error('Failed to remove member'); },
  });
}

export function useInviteMembers(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emails, role }: { emails: string[]; role: OrgRole }): Promise<InviteResult[]> => {
      if (!orgId) throw new Error('orgId is required');

      const results = await Promise.all(
        emails.map(async (email): Promise<InviteResult> => {
          try {
            const { error } = await supabase.functions.invoke('invite-member', {
              body: { org_id: orgId, email, role },
            });

            if (error) {
              const message = error.message ?? '';
              if (message.includes('already_member')) {
                return { email, status: 'already_member' };
              }
              return { email, status: 'failed', error: message };
            }

            return { email, status: 'sent' };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { email, status: 'failed', error: message };
          }
        })
      );

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: () => { toast.error('Failed to send invitations'); },
  });
}
