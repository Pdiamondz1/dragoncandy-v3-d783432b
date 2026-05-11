import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AssignmentInput {
  accountId: string;
  orgUnitId: string;
}

export function useAssignAccountLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignments: AssignmentInput[]) => {
      const results = await Promise.all(
        assignments.map(({ accountId, orgUnitId }) =>
          supabase
            .from('business_outstand_accounts')
            .update({ org_unit_id: orgUnitId })
            .eq('id', accountId)
        ),
      );

      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error('Some account assignments failed:', failed.map((r) => r.error));
        throw new Error(`${failed.length} assignment(s) failed`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['verified-status'] });
    },
  });
}
