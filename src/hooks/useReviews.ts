
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
      let query = supabase
        .from('project_reviews')
        .select(`
          *,
          reviewer:profiles!project_reviews_reviewer_id_fkey(full_name, avatar_url),
          collaboration:campaign_collaborations!inner(
            campaign:campaigns(title)
          )
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (revieweeId) {
        query = query.eq('reviewee_id', revieweeId);
      }

      if (reviewType) {
        query = query.eq('review_type', reviewType);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Type assertion to ensure proper typing
      return (data || []) as ReviewWithRelations[];
    },
    enabled: !!revieweeId,
  });
};

export const useReviewStats = (revieweeId?: string, reviewType?: string) => {
  return useQuery({
    queryKey: ['review-stats', revieweeId, reviewType],
    queryFn: async () => {
      if (!revieweeId) return null;

      let query = supabase
        .from('project_reviews')
        .select('rating')
        .eq('reviewee_id', revieweeId)
        .eq('is_public', true);

      if (reviewType) {
        query = query.eq('review_type', reviewType);
      }

      const { data, error } = await query;
      if (error) throw error;

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
    },
    enabled: !!revieweeId,
  });
};
