import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SaveAnswerInput {
  folder: 'concepts' | 'analyses';
  filename: string;
  title: string;
  tags?: string[];
  markdown: string;
  question?: string;
}

export interface SaveAnswerResult {
  url?: string;
  number?: number;
  error?: string;
}

/** Open a GitHub PR creating a new wiki page from an internal Donny answer. */
export function useSaveAnswerToWiki() {
  return useMutation({
    mutationFn: async (input: SaveAnswerInput): Promise<SaveAnswerResult> => {
      // Invoke through the Supabase client so the configured URL + anon key
      // (with their prod fallback) and the current admin session's bearer are
      // applied — no direct import.meta.env reads that break when those are unset.
      // The function returns file_exists / github_not_configured as HTTP 200 with
      // an { error } body, so those arrive here as `data` (not `error`) and the
      // dialog can react (rename / show the hint); a real non-2xx throws.
      const { data, error } = await supabase.functions.invoke<SaveAnswerResult>(
        'wiki-save-answer',
        { body: input },
      );
      if (error) throw error;
      return data ?? {};
    },
  });
}
