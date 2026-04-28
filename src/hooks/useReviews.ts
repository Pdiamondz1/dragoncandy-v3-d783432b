
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProjectReview } from '@/types/reviews';

// Define the extended review type with joined data
export interface ReviewWithRelations extends ProjectReview {
  reviewer: { 
    full_name: string; 
    avatar_url?: string;
  };
  collaboration: { 
    campaign: { 
      title: string;
    };
  };
}

export const useReviews = (revieweeId?: string, reviewType?: string) => {
  return useQuery({
    queryKey: ['reviews', revieweeId, reviewType],
    queryFn: async (): Promise<ReviewWithRelations[]> => {
      if (!revieweeId) return [];

      try {
        // First get basic reviews
        let query = supabase
          .from('project_reviews')
          .select('id, collaboration_id, sponsorship_id, reviewer_id, reviewee_id, rating, review_text, review_type, communication_rating, quality_rating, timeliness_rating, professionalism_rating, is_public, created_at, updated_at')
          .eq('reviewee_id', revieweeId)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (reviewType) {
          query = query.eq('review_type', reviewType);
        }

        const { data: reviews, error } = await query;
        if (error) {
          console.error('Error fetching reviews:', error);
          return [];
        }

        if (!reviews || reviews.length === 0) {
          return [];
        }

        // Then enrich with related data
        const enrichedReviews: ReviewWithRelations[] = [];
        
        for (const review of reviews) {
          try {
            // Get reviewer profile
            const { data: reviewer } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('id', review.reviewer_id)
              .single();

            // Get collaboration and campaign info
            let collaboration = null;
            if (review.collaboration_id) {
              const { data: collab } = await supabase
                .from('campaign_collaborations')
                .select('campaign_id')
                .eq('id', review.collaboration_id)
                .single();

              if (collab?.campaign_id) {
                const { data: campaign } = await supabase
                  .from('campaigns')
                  .select('title')
                  .eq('id', collab.campaign_id)
                  .single();

                if (campaign) {
                  collaboration = { campaign };
                }
              }
            }

            // Only add review if we have essential data
            if (reviewer?.full_name) {
              enrichedReviews.push({
                ...review,
                reviewer: {
                  full_name: reviewer.full_name,
                  avatar_url: reviewer.avatar_url
                },
                collaboration: collaboration || { campaign: { title: 'Project' } }
              } as ReviewWithRelations);
            }
          } catch (enrichError) {
            console.error('Error enriching review:', enrichError);
            // Skip this review but continue with others
          }
        }

        return enrichedReviews;
      } catch (error) {
        console.error('Error in useReviews:', error);
        return [];
      }
    },
    enabled: !!revieweeId,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useReviewStats = (revieweeId?: string, reviewType?: string) => {
  return useQuery({
    queryKey: ['review-stats', revieweeId, reviewType],
    queryFn: async () => {
      if (!revieweeId) {
        return {
          average_rating: 0,
          total_reviews: 0,
          rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }

      try {
        let query = supabase
          .from('project_reviews')
          .select('rating')
          .eq('reviewee_id', revieweeId)
          .eq('is_public', true);

        if (reviewType) {
          query = query.eq('review_type', reviewType);
        }

        const { data, error } = await query;
        if (error) {
          console.error('Error fetching review stats:', error);
          return {
            average_rating: 0,
            total_reviews: 0,
            rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          };
        }

        if (!data || data.length === 0) {
          return {
            average_rating: 0,
            total_reviews: 0,
            rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          };
        }

        const ratings = data.map(r => r.rating);
        const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
        
        const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratings.forEach(rating => {
          breakdown[rating as keyof typeof breakdown]++;
        });

        return {
          average_rating: Math.round(average * 10) / 10,
          total_reviews: ratings.length,
          rating_breakdown: breakdown
        };
      } catch (error) {
        console.error('Error in useReviewStats:', error);
        return {
          average_rating: 0,
          total_reviews: 0,
          rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }
    },
    enabled: !!revieweeId,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
