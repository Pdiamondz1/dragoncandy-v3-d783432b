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

      // Update review status based on whether it's a collaboration or sponsorship review
      if (reviewData.sponsorship_id) {
        // Sponsorship review - update campaign_sponsorships
        await updateSponsorshipReviewStatus(reviewData.sponsorship_id, user.id);
      } else if (reviewData.collaboration_id) {
        // Collaboration review - update campaign_collaborations
        await updateCollaborationReviewStatus(reviewData.collaboration_id, user.id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-completion'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-completion'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-review-completion'] });
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

async function updateCollaborationReviewStatus(collaborationId: string, _reviewerId: string) {
  // Check how many reviews exist for this collaboration
  const { data: reviews, error: reviewsError } = await supabase
    .from('project_reviews')
    .select('id, reviewer_id')
    .eq('collaboration_id', collaborationId);

  if (reviewsError) {
    console.error('Error checking collaboration reviews:', reviewsError);
    return;
  }

  // Determine new review status based on review count
  const reviewStatus = reviews && reviews.length >= 2 ? 'both_reviewed' : 'completed';

  const { error: updateError } = await supabase
    .from('campaign_collaborations')
    .update({ review_status: reviewStatus })
    .eq('id', collaborationId);

  if (updateError) {
    console.error('Error updating collaboration review status:', updateError);
  }
}

async function updateSponsorshipReviewStatus(sponsorshipId: string, _reviewerId: string) {
  // Check how many reviews exist for this sponsorship
  const { data: reviews, error: reviewsError } = await supabase
    .from('project_reviews')
    .select('id, reviewer_id')
    .eq('sponsorship_id', sponsorshipId);

  if (reviewsError) {
    console.error('Error checking sponsorship reviews:', reviewsError);
    return;
  }

  // Determine new review status based on review count
  const reviewStatus = reviews && reviews.length >= 2 ? 'both_reviewed' : 'completed';

  const { error: updateError } = await supabase
    .from('campaign_sponsorships')
    .update({ review_status: reviewStatus })
    .eq('id', sponsorshipId);

  if (updateError) {
    console.error('Error updating sponsorship review status:', updateError);
  }
}
