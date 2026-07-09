import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { buildGroupInviteNotification, type GroupMemberStatus } from '@/lib/groups/groupMembers';

export interface CreatorGroupMember {
  id: string;
  group_id: string;
  creator_id: string;
  status: GroupMemberStatus;
  invited_at: string;
  responded_at: string | null;
  _creator_name: string | null;
  _avatar_url: string | null;
}

const MEMBER_COLUMNS = 'id, group_id, creator_id, status, invited_at, responded_at';

export function useCreatorGroupMembers(groupId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator-group-members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_group_members')
        .select(MEMBER_COLUMNS)
        .eq('group_id', groupId)
        .order('invited_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [] as CreatorGroupMember[];

      // Enrich via separate batch fetches — nested joins are blocked by RLS.
      const creatorIds = [...new Set(data.map((m) => m.creator_id))];

      const [profileResult, creatorResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').in('id', creatorIds),
        supabase.from('creator_profiles').select('user_id, creator_name, avatar_url').in('user_id', creatorIds),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (creatorResult.error) throw creatorResult.error;

      const profileMap = new Map(
        (profileResult.data ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
      );
      const creatorMap = new Map(
        (creatorResult.data ?? []).map((c) => [c.user_id, { creator_name: c.creator_name, avatar_url: c.avatar_url }]),
      );

      return data.map((m) => {
        const profile = profileMap.get(m.creator_id);
        const creator = creatorMap.get(m.creator_id);
        return {
          ...m,
          status: m.status as GroupMemberStatus,
          _creator_name: creator?.creator_name ?? profile?.full_name ?? null,
          _avatar_url: profile?.avatar_url ?? creator?.avatar_url ?? null,
        } as CreatorGroupMember;
      });
    },
    enabled: !!groupId,
  });

  const inviteCreators = useMutation({
    mutationFn: async (creatorIds: string[]) => {
      // Look up which of these creators already have a membership row so we can
      // treat each correctly: brand-new -> insert 'invited'; previously
      // 'removed'/'declined' -> reactivate to 'invited' (the picker allows
      // re-selecting them, so a plain ignoreDuplicates upsert would silently
      // no-op and never re-notify); already 'active'/'invited' -> skip.
      const { data: existing, error: existingError } = await supabase
        .from('creator_group_members')
        .select('creator_id, status')
        .eq('group_id', groupId)
        .in('creator_id', creatorIds);

      if (existingError) throw existingError;

      const statusByCreator = new Map((existing ?? []).map((r) => [r.creator_id, r.status]));
      const toInsert = creatorIds.filter((id) => !statusByCreator.has(id));
      const toReactivate = creatorIds.filter((id) => {
        const s = statusByCreator.get(id);
        return s === 'removed' || s === 'declined';
      });

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('creator_group_members')
          .insert(
            toInsert.map((creatorId) => ({
              group_id: groupId,
              creator_id: creatorId,
              status: 'invited',
              invited_by: user!.id,
            })),
          );
        if (insertError) throw insertError;
      }

      if (toReactivate.length > 0) {
        const { error: reactivateError } = await supabase
          .from('creator_group_members')
          .update({ status: 'invited', invited_by: user!.id, invited_at: new Date().toISOString(), responded_at: null })
          .eq('group_id', groupId)
          .in('creator_id', toReactivate);
        if (reactivateError) throw reactivateError;
      }

      // Notify everyone freshly invited or re-invited.
      const invitedIds = [...toInsert, ...toReactivate];
      return invitedIds;
    },
    onSuccess: async (invitedIds) => {
      queryClient.invalidateQueries({ queryKey: ['creator-group-members', groupId] });

      if (invitedIds.length > 0) {
        const { data: group } = await supabase
          .from('creator_groups')
          .select('name')
          .eq('id', groupId)
          .single();

        const groupName = group?.name ?? 'a crew';

        for (const creatorId of invitedIds) {
          supabase.functions
            .invoke('create-notification', {
              body: buildGroupInviteNotification({
                creatorId,
                groupName,
                groupId,
                actorId: user!.id,
              }),
            })
            .catch((err: unknown) => console.error('Failed to send group invite notification:', err));
        }
      }

      toast({
        title: invitedIds.length > 0 ? 'Creators invited' : 'No new invites',
        description:
          invitedIds.length > 0
            ? 'The creators will get an in-app notification to join your crew.'
            : 'Those creators are already in this crew.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to invite creators',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (creatorId: string) => {
      const { error } = await supabase
        .from('creator_group_members')
        .update({ status: 'removed' })
        .eq('group_id', groupId)
        .eq('creator_id', creatorId);

      if (error) throw error;
      return creatorId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-group-members', groupId] });
      toast({ title: 'Creator removed from crew' });
    },
    onError: () => {
      toast({
        title: 'Failed to remove creator',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    inviteCreators,
    removeMember,
  };
}
