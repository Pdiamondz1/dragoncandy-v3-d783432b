import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ImportInput {
  file_id: string;
  folder: 'concepts' | 'analyses';
  filename: string;
  title: string;
  tags?: string[];
}

export interface ImportResult {
  url?: string;
  number?: number;
  error?: string;
}

/** Open a GitHub PR importing a Drive doc as a new wiki page in the Strategy library. */
export function useImportDocToLibrary() {
  return useMutation({
    mutationFn: async (input: ImportInput): Promise<ImportResult> => {
      // Invoke through the Supabase client so the configured URL + anon key
      // (with their prod fallback) and the current admin session's bearer are
      // applied — no direct import.meta.env reads.
      // The function returns typed errors as HTTP 200 with an { error } body,
      // so those arrive here as `data` (not `error`) and the dialog can react;
      // a real non-2xx throws.
      const { data, error } = await supabase.functions.invoke<ImportResult>(
        'wiki-import-doc',
        { body: input },
      );
      if (error) throw error;
      return data ?? {};
    },
  });
}
