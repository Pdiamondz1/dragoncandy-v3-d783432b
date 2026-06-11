import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BriefingKpi {
  key: string;
  label: string;
  value: string;
  target?: string;
  status?: 'on_track' | 'at_risk' | 'off_track' | string;
}

export interface Briefing {
  id: string;
  week_start: string;
  title: string;
  body_md: string;
  kpis: BriefingKpi[];
  generated_by: string;
  published_at: string | null;
  created_at: string;
}

/** Weekly operating briefs. RLS: admins see drafts; stakeholders see published only. */
export function useBriefings() {
  return useQuery({
    queryKey: ['aios', 'briefings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_briefings')
        .select('id, week_start, title, body_md, kpis, generated_by, published_at, created_at')
        .order('week_start', { ascending: false });
      if (error) {
        console.error('aios_briefings list failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as Briefing[];
    },
  });
}

/** Admin-only publish gate toggle (RLS rejects non-admins). */
export function usePublishBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase
        .from('aios_briefings')
        .update({ published_at: publish ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'briefings'] });
    },
  });
}
