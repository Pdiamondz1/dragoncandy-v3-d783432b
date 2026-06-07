import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useIsUserBlocked(otherId?: string) {
  return useQuery({
    queryKey: ['user-blocked', otherId],
    enabled: !!otherId,
    queryFn: async () => {
      // enabled: !!otherId guarantees otherId is defined here
      const { data, error } = await supabase.rpc('is_user_blocked', { p_other_id: otherId! });
      if (error) throw error;
      return data ?? false;
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.rpc('block_user', { p_blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: (_d, blockedId) => {
      toast.success('User blocked.');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['user-blocked', blockedId] });
    },
    onError: () => toast.error('Could not block this user. Please try again.'),
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.rpc('unblock_user', { p_blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: (_d, blockedId) => {
      toast.success('User unblocked.');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['user-blocked', blockedId] });
    },
    onError: () => toast.error('Could not unblock this user. Please try again.'),
  });
}
