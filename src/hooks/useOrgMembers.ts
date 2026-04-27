import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OrgMember, OrgRole } from '@/types/org';

type InviteResult = {
  email: string;
  status: 'sent' | 'failed' | 'already_member';
  error?: string;
};

type ProfileJoin = {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
} | null;

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
  profiles: ProfileJoin;
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
    full_name: row.profiles?.full_name ?? null,
    email: row.profiles?.email ?? undefined,
    avatar_url: row.profiles?.avatar_url ?? null,
  };
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async (): Promise<OrgMember[]> => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('org_members')
        .select(`
          id, org_id, user_id, role, invited_by,
          invitation_status, invited_at, joined_at, last_active_at,
          profiles!org_members_user_id_fkey (full_name, email, avatar_url)
        `)
        .eq('org_id', orgId)
        .neq('invitation_status', 'suspended')
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });

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
  });
}
