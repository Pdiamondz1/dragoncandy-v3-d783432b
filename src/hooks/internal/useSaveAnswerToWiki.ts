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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wiki-save-answer`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(input),
        },
      );
      const data = (await res.json().catch(() => ({}))) as SaveAnswerResult;
      // file_exists / github_not_configured return 200 with an error field —
      // surface as data so the dialog can react (rename / show hint).
      if (!res.ok && !data.error) throw new Error('Save to knowledge failed');
      return data;
    },
  });
}
