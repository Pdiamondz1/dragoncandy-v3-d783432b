// src/hooks/useCreateReview.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface CreateReviewInput {
  collaborationId: string;
  revieweeId: string;
  rating: number;
  reviewText?: string;
}

export const useCreateReview = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId, revieweeId, rating, reviewText }: CreateReviewInput) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('project_reviews')
        .insert({
          collaboration_id: collaborationId,
          reviewer_id: user.id,
          reviewee_id: revieweeId,
          review_type: 'creator_to_business',
          rating,
          review_text: reviewText || null,
          is_public: true,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-collaborations'] });
      toast({
        title: 'Review submitted!',
        description: 'Thanks for your feedback.',
      });
    },
    onError: (error) => {
      console.error('Failed to submit review:', error);
      toast({
        title: 'Failed to submit review',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
