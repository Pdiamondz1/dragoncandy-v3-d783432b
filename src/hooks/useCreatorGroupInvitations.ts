import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * A pending crew ("creator group") invitation for the current creator.
 *
 * RLS note: while a creator is only `invited` (not yet `active`), the
 * `creator_groups` row is NOT readable — `cg_member_select` requires
 * `is_active_group_member(...)`. So the embedded `creator_groups` read below
 * returns null (name AND owner_id), and the owner's business name is therefore
 * unavailable too. The card falls back to "A crew" for v1. Once the creator
 * accepts (→ active) the group row becomes readable, which is how we recover
 * `owner_id` to notify the owner in `accept`'s onSuccess.
 */
export interface CreatorGroupInvitation {
  id: string;
  group_id: string;
  invited_at: string;
  _group_name: string | null;
  _business_name: string | null;
  _owner_avatar_url: string | null;
}

interface RawGroupInvitationRow {
  id: string;
  group_id: string;
  invited_at: string;
  creator_groups: { id: string; name: string; owner_id: string } | null;
}

export function useCreatorGroupInvitations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator-group-invitations', user?.id],
    queryFn: async (): Promise<CreatorGroupInvitation[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('creator_group_members')
        .select('id, group_id, invited_at, creator_groups:group_id ( id, name, owner_id )')
        .eq('creator_id', user.id)
        .eq('status', 'invited')
        .order('invited_at', { ascending: false });

      if (error) {
        console.error('Error fetching creator group invitations:', error);
        throw error;
      }
      if (!data || data.length === 0) return [];

      // supabase-js can infer a to-many shape for the embed; this is a
      // to-one FK (group_id → creator_groups.id), so normalize explicitly.
      const rows = data as unknown as RawGroupInvitationRow[];

      // owner_id is only present once the group row is readable (active member).
      const ownerIds = [
        ...new Set(rows.map((r) => r.creator_groups?.owner_id).filter(Boolean)),
      ] as string[];

      let businessMap = new Map<string, string>();
      let avatarMap = new Map<string, string | null>();
      if (ownerIds.length > 0) {
        const [bpResult, profileResult] = await Promise.all([
          supabase.from('business_profiles').select('user_id, business_name').in('user_id', ownerIds),
          supabase.from('profiles').select('id, avatar_url').in('id', ownerIds),
        ]);
        if (bpResult.data) {
          businessMap = new Map(bpResult.data.map((b) => [b.user_id, b.business_name]));
        }
        if (profileResult.data) {
          avatarMap = new Map(profileResult.data.map((p) => [p.id, p.avatar_url]));
        }
      }

      return rows.map((r) => {
        const ownerId = r.creator_groups?.owner_id ?? '';
        return {
          id: r.id,
          group_id: r.group_id,
          invited_at: r.invited_at,
          _group_name: r.creator_groups?.name ?? null,
          _business_name: businessMap.get(ownerId) ?? null,
          _owner_avatar_url: avatarMap.get(ownerId) ?? null,
        };
      });
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['creator-group-invitations', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['group-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['creator-groups'] });
  };

  const accept = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('respond_to_group_invitation', {
        p_group_id: groupId,
        p_accept: true,
      });
      if (error) throw error;
      return groupId;
    },
    onSuccess: async (groupId) => {
      invalidateAll();
      toast({ title: 'Crew joined', description: "You're now part of this crew." });

      // Now an active member, so the group row is readable — recover owner_id.
      const [{ data: group }, { data: creatorProfile }] = await Promise.all([
        supabase.from('creator_groups').select('id, owner_id').eq('id', groupId).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle(),
      ]);

      const ownerId = group?.owner_id;
      if (!ownerId) return;

      const creatorName = creatorProfile?.full_name ?? 'A creator';

      supabase.functions
        .invoke('create-notification', {
          body: {
            recipientId: ownerId,
            type: 'group_invite_accepted',
            category: 'campaigns',
            title: 'Crew invite accepted',
            body: `${creatorName} joined your crew`,
            actionUrl: `/dashboard/business/groups/${groupId}`,
            actorId: user!.id,
            actorName: creatorName,
            icon: 'invitation',
            data: { group_id: groupId },
          },
        })
        .catch((err: unknown) => console.error('Failed to send crew-accept notification:', err));
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to join crew', description: message, variant: 'destructive' });
    },
  });

  const decline = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('respond_to_group_invitation', {
        p_group_id: groupId,
        p_accept: false,
      });
      if (error) throw error;
      return groupId;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Crew invitation declined' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to decline invitation', description: message, variant: 'destructive' });
    },
  });

  return {
    invitations: query.data ?? [],
    isLoading: query.isLoading,
    accept,
    decline,
  };
}
