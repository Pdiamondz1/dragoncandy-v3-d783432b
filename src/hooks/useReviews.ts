
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProjectReview } from '@/types/reviews';

// Local row interface for public_project_reviews view (not in generated types.ts)
interface PublicReviewRow {
  id: string;
  collaboration_id: string | null;
  sponsorship_id: string | null;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  review_text: string | null;
  review_type: ProjectReview['review_type'];
  communication_rating: number | null;
  quality_rating: number | null;
  timeliness_rating: number | null;
  professionalism_rating: number | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  reveal_at: string | null;
  reviewer_full_name: string | null;
  reviewer_avatar_url: string | null;
  project_title: string | null;
}

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
          .from('public_project_reviews' as never)
          .select(`
            id, collaboration_id, sponsorship_id, reviewer_id, reviewee_id,
            rating, review_text, review_type,
            communication_rating, quality_rating, timeliness_rating, professionalism_rating,
            is_public, created_at, updated_at,
            reviewer_full_name, reviewer_avatar_url, project_title
          `)
          .eq('reviewee_id', revieweeId)
          .order('created_at', { ascending: false });

        if (reviewType) {
          query = query.eq('review_type', reviewType);
        }

        const { data, error } = await query;
        if (error) {
          console.error('Error fetching reviews:', error);
          return [];
        }
        const rows = (data ?? []) as unknown as PublicReviewRow[];
        if (rows.length === 0) return [];

        return rows
          .filter((r) => r.reviewer_full_name)
          .map((r) => ({
            id: r.id,
            collaboration_id: r.collaboration_id ?? undefined,
            sponsorship_id: r.sponsorship_id ?? undefined,
            reviewer_id: r.reviewer_id,
            reviewee_id: r.reviewee_id,
            rating: r.rating,
            review_text: r.review_text ?? undefined,
            review_type: r.review_type,
            communication_rating: r.communication_rating ?? undefined,
            quality_rating: r.quality_rating ?? undefined,
            timeliness_rating: r.timeliness_rating ?? undefined,
            professionalism_rating: r.professionalism_rating ?? undefined,
            is_public: r.is_public,
            created_at: r.created_at,
            updated_at: r.updated_at,
            reviewer: { full_name: r.reviewer_full_name as string, avatar_url: r.reviewer_avatar_url ?? undefined },
            collaboration: { campaign: { title: r.project_title ?? 'Project' } },
          } as ReviewWithRelations));
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
          .from('public_project_reviews' as never)
          .select('rating')
          .eq('reviewee_id', revieweeId);

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

        const ratings = ((data ?? []) as unknown as { rating: number }[]).map(r => r.rating);
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
