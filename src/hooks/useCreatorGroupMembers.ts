import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import {
  buildGroupInviteNotification,
  buildGroupRemovalNotification,
  type GroupMemberStatus,
} from '@/lib/groups/groupMembers';

/**
 * The crew's display identity, needed by both the invite and removal
 * notifications. The owner can always read their own crew row and their own
 * business profile, so neither lookup is RLS-sensitive here.
 */
async function fetchCrewIdentity(groupId: string, ownerId: string) {
  const [{ data: group }, { data: business }] = await Promise.all([
    supabase.from('creator_groups').select('name').eq('id', groupId).maybeSingle(),
    supabase.from('business_profiles').select('business_name').eq('user_id', ownerId).maybeSingle(),
  ]);
  return {
    groupName: group?.name ?? 'a crew',
    businessName: business?.business_name ?? null,
  };
}

/**
 * `supabase.functions.invoke` RESOLVES with `{ data, error }` on a non-2xx — it
 * does not reject. A bare `.catch()` therefore swallows every 4xx/5xx silently,
 * so failures must be counted from both the settled state and `value.error`.
 */
function countFailedDispatches(
  results: PromiseSettledResult<{ error: unknown }>[],
): number {
  return results.filter(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !!r.value.error),
  ).length;
}

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

      // Notify everyone freshly invited or re-invited. Dispatched here rather
      // than fire-and-forget in onSuccess so the mutation stays pending until
      // it settles — closing the tab mid-flight used to leave a creator in the
      // crew having never been told.
      const invitedIds = [...toInsert, ...toReactivate];
      if (invitedIds.length === 0) return { invitedIds, failed: 0 };

      const { groupName, businessName } = await fetchCrewIdentity(groupId, user!.id);

      const results = await Promise.allSettled(
        invitedIds.map((creatorId) =>
          supabase.functions.invoke('create-notification', {
            body: buildGroupInviteNotification({
              creatorId,
              groupName,
              groupId,
              actorId: user!.id,
              businessName,
            }),
          }),
        ),
      );

      return { invitedIds, failed: countFailedDispatches(results) };
    },
    onSuccess: ({ invitedIds, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['creator-group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['creator-group-member-counts'] });

      if (invitedIds.length === 0) {
        toast({ title: 'No new invites', description: 'Those creators are already in this crew.' });
        return;
      }

      if (failed > 0) {
        toast({
          title: "Invited, but some notifications didn't send",
          description: `${failed} creator(s) may not have been alerted. They'll still see the invite next time they open Crews.`,
        });
        return;
      }

      toast({
        title: 'Creators invited',
        description:
          "They'll get a notification and email inviting them to join. You'll see them under Pending until they accept.",
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
    mutationFn: async ({ creatorId, wasActive }: { creatorId: string; wasActive: boolean }) => {
      const { error } = await supabase
        .from('creator_group_members')
        .update({ status: 'removed' })
        .eq('group_id', groupId)
        .eq('creator_id', creatorId);

      if (error) throw error;

      // Only tell someone they've left a crew they actually joined —
      // rescinding a still-pending invite is not a removal. Best-effort: the
      // removal itself has already succeeded, so a failed bell must not throw.
      if (wasActive) {
        const { groupName, businessName } = await fetchCrewIdentity(groupId, user!.id);
        await supabase.functions
          .invoke('create-notification', {
            body: buildGroupRemovalNotification({
              creatorId,
              groupName,
              groupId,
              actorId: user!.id,
              businessName,
            }),
          })
          .catch((err: unknown) => console.error('Failed to send crew removal notification:', err));
      }

      return creatorId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['creator-group-member-counts'] });
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
