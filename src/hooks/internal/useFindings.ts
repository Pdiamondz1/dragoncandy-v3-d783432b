import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'wontfix';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  summary_md: string;
  evidence: Record<string, unknown>;
  source: string;
  status: FindingStatus;
  occurrences: number;
  last_seen_at: string;
  created_at: string;
}

/** Bug & error findings (admin-only via RLS). */
export function useFindings() {
  return useQuery({
    queryKey: ['aios', 'findings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_findings')
        .select('id, severity, title, summary_md, evidence, source, status, occurrences, last_seen_at, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('aios_findings list failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as Finding[];
    },
  });
}

export function useUpdateFindingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FindingStatus }) => {
      const { error } = await supabase.from('aios_findings').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'findings'] });
    },
  });
}
