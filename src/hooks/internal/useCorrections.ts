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
          'id, target_type, target_ref, title, rationale_md, current_value, proposed_value, status, proposed_by, proposed_by_user, reviewed_by, reviewed_at, applied_at, created_at, updated_at',
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
    },
  });
}
