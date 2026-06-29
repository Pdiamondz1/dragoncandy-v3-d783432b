import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InternalDocSummary {
  id: string;
  path: string;
  title: string;
  tags: string[];
  updated_at: string;
  is_core: boolean;
  archived_at: string | null;
}

export function useInternalDocs(opts?: { archived?: boolean }) {
  const archived = opts?.archived ?? false;
  return useQuery({
    queryKey: ['aios', 'internal-docs', archived ? 'archived' : 'active'],
    queryFn: async () => {
      let q = supabase
        .from('internal_docs')
        .select('id, path, title, tags, updated_at, is_core, archived_at')
        .order('title');
      q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
      const { data, error } = await q;
      if (error) {
        console.error('internal_docs list failed:', error);
        throw error;
      }
      return (data ?? []) as InternalDocSummary[];
    },
  });
}

export function useInternalDoc(id: string | null) {
  return useQuery({
    queryKey: ['aios', 'internal-doc', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_docs')
        .select('id, path, title, content_md, updated_at, is_core, archived_at, archive_reason')
        .eq('id', id!)
        .single();
      if (error) {
        console.error('internal_docs fetch failed:', error);
        throw error;
      }
      return data as {
        id: string;
        path: string;
        title: string;
        content_md: string;
        updated_at: string;
        is_core: boolean;
        archived_at: string | null;
        archive_reason: string | null;
      };
    },
    enabled: !!id,
  });
}
