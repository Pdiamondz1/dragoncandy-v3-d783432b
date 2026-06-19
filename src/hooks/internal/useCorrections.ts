import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CorrectionTargetType = 'dashboard_setting' | 'strategy_doc';
export type CorrectionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'superseded';

export interface Correction {
  id: string;
  target_type: CorrectionTargetType;
  target_ref: string;
  title: string;
  rationale_md: string;
  current_value: unknown;
  proposed_value: unknown;
  status: CorrectionStatus;
  proposed_by: string;
  proposed_by_user: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  wiki_pr_url: string | null;
  wiki_pr_number: number | null;
  wiki_committed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Result shape returned by the aios_corrections_apply RPC. */
export interface ReviewResult {
  status: CorrectionStatus;
  message?: string;
  target_type?: CorrectionTargetType;
  wiki_path?: string;
  corrected_md?: string;
}

/** Correction proposals queued by Donny (admin-only via RLS). */
export function useCorrections() {
  return useQuery({
    queryKey: ['aios', 'corrections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aios_corrections')
        .select(
          'id, target_type, target_ref, title, rationale_md, current_value, proposed_value, status, proposed_by, proposed_by_user, reviewed_by, reviewed_at, applied_at, wiki_pr_url, wiki_pr_number, wiki_committed_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false });
      if (error) {
        console.error('aios_corrections list failed:', error);
        throw error;
      }
      return (data ?? []) as unknown as Correction[];
    },
  });
}

/** Approve or reject a proposal via the admin-gated apply RPC. */
export function useReviewCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
    }: {
      id: string;
      decision: 'approve' | 'reject';
    }): Promise<ReviewResult> => {
      const { data, error } = await supabase.rpc('aios_corrections_apply', {
        p_id: id,
        p_decision: decision,
      });
      if (error) throw error;
      return data as unknown as ReviewResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'corrections'] });
      // An applied dashboard_setting changes the live value the weight page reads.
      queryClient.invalidateQueries({ queryKey: ['aios', 'dashboard-settings'] });
      // An applied strategy_doc rewrites internal_docs — refresh the Strategy
      // list and every doc-detail query so it doesn't show stale content.
      queryClient.invalidateQueries({ queryKey: ['aios', 'internal-docs'] });
      queryClient.invalidateQueries({ queryKey: ['aios', 'internal-doc'] });
    },
  });
}

export interface CommitPrResult {
  url?: string;
  number?: number;
  already?: boolean;
  persisted?: boolean;
  error?: string;
}

/** Open (or fetch the existing) wiki PR for an applied strategy-doc correction. */
export function useCommitWikiPr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (correctionId: string): Promise<CommitPrResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wiki-commit-pr`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ correction_id: correctionId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as CommitPrResult;
      // github_not_configured returns 200 with an error field — surface it as
      // data, not a throw, so the UI shows the hint instead of a toast.
      if (!res.ok && !data.error) throw new Error('Wiki PR request failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aios', 'corrections'] }),
  });
}
