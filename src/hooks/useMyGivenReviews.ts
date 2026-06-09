import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GivenReview {
  id: string;
  reviewee_id: string;
  rating: number;
  review_text?: string | null;
  review_type: string;
  created_at: string;
  is_revealed: boolean;
}

export const useMyGivenReviews = (userId?: string) =>
  useQuery({
    queryKey: ['my-given-reviews', userId],
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<GivenReview[]> => {
      if (!userId) return [];
      const { data: mine, error } = await supabase
        .from('project_reviews')
        .select('id, reviewee_id, rating, review_text, review_type, created_at')
        .eq('reviewer_id', userId)
        .order('created_at', { ascending: false });
      if (error) { console.error('useMyGivenReviews error:', error); return []; }
      if (!mine || mine.length === 0) return [];

      const { data: revealed, error: revealedError } = await (supabase.from('public_project_reviews' as never) as any)
        .select('id')
        .eq('reviewer_id', userId);
      // If the reveal lookup fails we can't know each review's state. Default to
      // "revealed" (no pending badge) rather than falsely flagging live reviews as hidden.
      if (revealedError) {
        console.error('useMyGivenReviews reveal lookup error:', revealedError);
        return mine.map((r) => ({ ...r, is_revealed: true }));
      }
      const revealedIds = new Set(((revealed ?? []) as unknown as { id: string }[]).map((r) => r.id));

      return mine.map((r) => ({ ...r, is_revealed: revealedIds.has(r.id) }));
    },
  });
