import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InternalDocSummary {
  id: string;
  path: string;
  title: string;
  tags: string[];
  updated_at: string;
}

export function useInternalDocs() {
  return useQuery({
    queryKey: ['aios', 'internal-docs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_docs')
        .select('id, path, title, tags, updated_at')
        .order('title');
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
        .select('id, path, title, content_md, updated_at')
        .eq('id', id!)
        .single();
      if (error) {
        console.error('internal_docs fetch failed:', error);
        throw error;
      }
      return data as { id: string; path: string; title: string; content_md: string; updated_at: string };
    },
    enabled: !!id,
  });
}
