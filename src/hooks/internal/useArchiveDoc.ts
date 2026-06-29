import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ArchiveResult {
  status: 'archived' | 'unarchived' | 'already_archived';
  path: string;
  note?: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['aios', 'internal-docs'] });
  qc.invalidateQueries({ queryKey: ['aios', 'internal-doc'] });
}

export function useArchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, reason }: { path: string; reason?: string }): Promise<ArchiveResult> => {
      const { data, error } = await supabase.rpc('internal_doc_archive', {
        p_path: path,
        p_reason: reason || undefined,
      });
      if (error) throw error;
      return data as unknown as ArchiveResult;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUnarchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string): Promise<ArchiveResult> => {
      const { data, error } = await supabase.rpc('internal_doc_unarchive', { p_path: path });
      if (error) throw error;
      return data as unknown as ArchiveResult;
    },
    onSuccess: () => invalidate(qc),
  });
}
