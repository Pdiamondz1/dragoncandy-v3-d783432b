import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CreatorPackage } from '@/types/packages';

/** The signed-in creator's own packages (RLS: "Creators manage own packages", creator_id = auth.uid()). */
export const useCreatorPackages = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['creator-packages', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_packages')
        .select('*')
        .eq('creator_id', user!.id)
        .neq('status', 'archived')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreatorPackage[];
    },
    enabled: !!user,
  });

  return { packages: data ?? [], isLoading };
};
