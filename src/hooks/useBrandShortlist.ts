import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface ShortlistedCreator {
  id: string;
  brand_id: string;
  creator_id: string;
  notes: string | null;
  created_at: string;
}

export function useBrandShortlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['brand-shortlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_shortlists')
        .select('id, brand_id, creator_id, notes, created_at')
        .eq('brand_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ShortlistedCreator[];
    },
    enabled: !!user,
  });

  const addToShortlist = useMutation({
    mutationFn: async (creatorId: string) => {
      const { data, error } = await supabase
        .from('brand_shortlists')
        .insert({ brand_id: user!.id, creator_id: creatorId })
        .select()
        .single();

      if (error) throw error;
      return data as ShortlistedCreator;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-shortlist', user?.id] });
      toast({ title: 'Creator saved to shortlist' });
    },
    onError: (error: Error) => {
      const isDuplicate = error.message?.includes('duplicate key');
      toast({
        title: isDuplicate ? 'Already shortlisted' : 'Failed to save creator',
        description: isDuplicate ? 'This creator is already on your shortlist.' : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const removeFromShortlist = useMutation({
    mutationFn: async (creatorId: string) => {
      const { error } = await supabase
        .from('brand_shortlists')
        .delete()
        .eq('brand_id', user!.id)
        .eq('creator_id', creatorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-shortlist', user?.id] });
      toast({ title: 'Creator removed from shortlist' });
    },
    onError: () => {
      toast({
        title: 'Failed to remove creator',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const isShortlisted = (creatorId: string): boolean => {
    return (query.data ?? []).some((s) => s.creator_id === creatorId);
  };

  return {
    shortlist: query.data ?? [],
    isLoading: query.isLoading,
    isShortlisted,
    addToShortlist,
    removeFromShortlist,
  };
}
