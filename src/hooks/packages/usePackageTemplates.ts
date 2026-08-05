import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PackageTemplate } from '@/types/packages';

/** Platform-seeded starter kits the creator picks from (public read: RLS allows anyone to read active rows). */
export const usePackageTemplates = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['package-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PackageTemplate[];
    },
  });

  return { templates: data ?? [], isLoading };
};
