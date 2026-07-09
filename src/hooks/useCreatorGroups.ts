import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface CreatorGroup {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const GROUP_COLUMNS = 'id, owner_id, name, description, created_at, updated_at';

/**
 * Detects a Postgres foreign-key violation (23503) surfaced through a Supabase
 * error. Phase 2 adds `campaigns.group_id ON DELETE RESTRICT`, so deleting a
 * crew that still has campaigns should be reported as a user-actionable error.
 */
function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  if (err.code === '23503') return true;
  const message = err.message?.toLowerCase() ?? '';
  return message.includes('foreign key') || message.includes('violates');
}

export function useCreatorGroups() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator-groups', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_groups')
        .select(GROUP_COLUMNS)
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CreatorGroup[];
    },
    enabled: !!user,
  });

  const createGroup = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('creator_groups')
        .insert({ owner_id: user!.id, name, description: description ?? null })
        .select(GROUP_COLUMNS)
        .single();

      if (error) throw error;
      return data as CreatorGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-groups', user?.id] });
      toast({ title: 'Crew created' });
    },
    onError: () => {
      toast({
        title: 'Failed to create crew',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('creator_groups')
        .update({ name, description: description ?? null })
        .eq('id', id)
        .eq('owner_id', user!.id)
        .select(GROUP_COLUMNS)
        .single();

      if (error) throw error;
      return data as CreatorGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-groups', user?.id] });
      toast({ title: 'Crew updated' });
    },
    onError: () => {
      toast({
        title: 'Failed to update crew',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('creator_groups')
        .delete()
        .eq('id', id)
        .eq('owner_id', user!.id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-groups', user?.id] });
      toast({ title: 'Crew deleted' });
    },
    onError: (error: unknown) => {
      if (isForeignKeyViolation(error)) {
        toast({
          title: 'Cannot delete this crew',
          description: "Remove or reassign this crew's campaigns first.",
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Failed to delete crew',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return {
    groups: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createGroup,
    renameGroup,
    deleteGroup,
  };
}
