import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useHasReviewedCollaboration(
  collaborationId: string | undefined,
  reviewerId: string | undefined,
) {
  return useQuery({
    queryKey: ['has-reviewed-collaboration', collaborationId, reviewerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_reviews')
        .select('id, rating, review_text')
        .eq('collaboration_id', collaborationId!)
        .eq('reviewer_id', reviewerId!)
        .maybeSingle();
      return data;
    },
    enabled: !!collaborationId && !!reviewerId,
    staleTime: 2 * 60 * 1000,
  });
}
