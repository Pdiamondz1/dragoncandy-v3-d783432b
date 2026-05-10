import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CampaignTemplate {
  id: string;
  title: string;
  deliverables: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  platforms: string[] | null;
  use_count: number;
}

export function useCampaignTemplates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-templates', user?.id],
    queryFn: async (): Promise<CampaignTemplate[]> => {
      if (!user) return [];

      const { data: completed, error } = await supabase
        .from('campaigns')
        .select('id, title, deliverables, budget_min, budget_max, platforms')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!completed?.length) return [];

      const ids = completed.map((c) => c.id);
      const { data: dupes } = await supabase
        .from('campaigns')
        .select('duplicated_from')
        .in('duplicated_from', ids);

      const countMap = new Map<string, number>();
      dupes?.forEach((d) => {
        const from = (d as { duplicated_from: string | null }).duplicated_from;
        if (from) countMap.set(from, (countMap.get(from) ?? 0) + 1);
      });

      return completed.map((c) => ({
        id: c.id,
        title: c.title,
        deliverables: c.deliverables as string[] | null,
        budget_min: c.budget_min,
        budget_max: c.budget_max,
        platforms: c.platforms as string[] | null,
        use_count: countMap.get(c.id) ?? 0,
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
