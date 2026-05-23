
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
        let query = supabase
          .from('project_reviews')
          .select(`
            id, collaboration_id, sponsorship_id, reviewer_id, reviewee_id,
            rating, review_text, review_type,
            communication_rating, quality_rating, timeliness_rating, professionalism_rating,
            is_public, created_at, updated_at,
            profiles!project_reviews_reviewer_id_fkey(full_name, avatar_url),
            campaign_collaborations(campaign_id, campaigns(title))
          `)
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

        return reviews
          .filter((r) => (r.profiles as unknown as { full_name: string } | null)?.full_name)
          .map((r) => {
            const profile = r.profiles as unknown as { full_name: string; avatar_url?: string };
            const collab = r.campaign_collaborations as unknown as { campaigns: { title: string } | null } | null;
            return {
              id: r.id,
              collaboration_id: r.collaboration_id,
              sponsorship_id: r.sponsorship_id,
              reviewer_id: r.reviewer_id,
              reviewee_id: r.reviewee_id,
              rating: r.rating,
              review_text: r.review_text,
              review_type: r.review_type,
              communication_rating: r.communication_rating,
              quality_rating: r.quality_rating,
              timeliness_rating: r.timeliness_rating,
              professionalism_rating: r.professionalism_rating,
              is_public: r.is_public,
              created_at: r.created_at,
              updated_at: r.updated_at,
              reviewer: {
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
              },
              collaboration: collab?.campaigns
                ? { campaign: { title: collab.campaigns.title } }
                : { campaign: { title: 'Project' } },
            } as ReviewWithRelations;
          });
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
