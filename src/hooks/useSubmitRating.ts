
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CreateReviewData } from '@/types/reviews';
import { toast } from '@/hooks/use-toast';

export const useSubmitRating = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reviewData: CreateReviewData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('project_reviews')
        .insert({
          ...reviewData,
          reviewer_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Update collaboration review status
      const { error: updateError } = await supabase
        .from('campaign_collaborations')
        .update({ 
          review_status: 'completed' // You might want to check if both parties have reviewed
        })
        .eq('id', reviewData.collaboration_id);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-completion'] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['profile-ratings'] });
      toast({
        title: "Review submitted successfully",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error) => {
      console.error('Error submitting review:', error);
      toast({
        title: "Error submitting review",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });
};
