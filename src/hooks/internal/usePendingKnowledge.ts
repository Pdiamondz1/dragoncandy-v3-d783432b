import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingPr {
  number: number;
  title: string;
  html_url: string;
  head_branch: string;
  paths: string[];
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('wiki-merge-pr', { body });
  if (error) throw error;
  return data as T;
}

export function usePendingKnowledgePrs() {
  return useQuery({
    queryKey: ['aios', 'pending-knowledge'],
    queryFn: () => call<{ prs: PendingPr[] }>({ action: 'list' }).then((d) => d.prs),
  });
}

export function usePreviewKnowledgePr(prNumber: number | null) {
  return useQuery({
    queryKey: ['aios', 'pending-knowledge', 'preview', prNumber],
    queryFn: () => call<{ path: string; markdown: string }>({ action: 'preview', pr_number: prNumber! }),
    enabled: prNumber !== null,
  });
}

export interface MergeResult {
  merged?: boolean;
  synced?: boolean;
  synced_paths?: string[];
  sync_error?: string;
  state?: 'not_mergeable_yet' | 'not_mergeable';
  reason?: string;
  error?: string;
}

export function useMergeKnowledgePr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prNumber: number) => call<MergeResult>({ action: 'merge', pr_number: prNumber }),
    onSuccess: (data) => {
      if (data.merged) {
        qc.invalidateQueries({ queryKey: ['aios', 'pending-knowledge'] });
        qc.invalidateQueries({ queryKey: ['aios', 'internal-docs'] }); // refresh Strategy library
      }
    },
  });
}
