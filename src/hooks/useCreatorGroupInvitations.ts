import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import type { Database } from '@/integrations/supabase/types';

type PendingInviteRow =
  Database['public']['Functions']['get_creator_pending_group_invitations']['Returns'][number];

/**
 * A pending crew ("creator group") invitation for the current creator.
 *
 * RLS note: while a creator is only `invited` (not yet `active`), the
 * `creator_groups` row is NOT directly readable — `cg_member_select` requires
 * `is_active_group_member(...)`. So we read pending invitations (with the crew
 * name + inviting business) through the SECURITY DEFINER RPC
 * `get_creator_pending_group_invitations()`, which is gated on
 * `creator_id = auth.uid()` (a caller only ever sees their own pending invites).
 */
export interface CreatorGroupInvitation {
  id: string;
  group_id: string;
  invited_at: string;
  _group_name: string | null;
  _business_name: string | null;
  _owner_avatar_url: string | null;
}

export function useCreatorGroupInvitations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator-group-invitations', user?.id],
    queryFn: async (): Promise<CreatorGroupInvitation[]> => {
      if (!user) return [];

      const { data, error } = await supabase.rpc('get_creator_pending_group_invitations');

      if (error) {
        console.error('Error fetching creator group invitations:', error);
        throw error;
      }
      if (!data || data.length === 0) return [];

      return (data as PendingInviteRow[]).map((r) => ({
        id: r.id,
        group_id: r.group_id,
        invited_at: r.invited_at,
        _group_name: r.group_name ?? null,
        _business_name: r.business_name ?? null,
        _owner_avatar_url: r.owner_avatar_url ?? null,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['creator-group-invitations', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['group-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['creator-groups'] });
    // Without this, an accepted crew doesn't appear in "Your crews" until a refetch.
    queryClient.invalidateQueries({ queryKey: ['my-crews', user?.id] });
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

      // Best-effort: the creator has already joined. dispatchNotification reads
      // the error off the result (invoke resolves on a non-2xx) and never throws.
      void dispatchNotification({
        recipientId: ownerId,
        type: 'group_invite_accepted',
        category: 'campaigns',
        title: 'Crew invite accepted',
        body: `${creatorName} joined your crew`,
        actionUrl: `/dashboard/business/crews/${groupId}`,
        actorId: user!.id,
        actorName: creatorName,
        icon: 'invitation',
        data: { group_id: groupId },
      });
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
