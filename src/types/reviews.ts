
export interface ProjectReview {
  id: string;
  collaboration_id?: string;
  sponsorship_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  review_text?: string;
  review_type: 'business_to_creator' | 'creator_to_business' | 'brand_to_business' | 'business_to_brand';
  communication_rating?: number;
  quality_rating?: number;
  timeliness_rating?: number;
  professionalism_rating?: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewResponse {
  id: string;
  review_id: string;
  responder_id: string;
  response_text: string;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewData {
  collaboration_id?: string;
  sponsorship_id?: string;
  reviewee_id: string;
  rating: number;
  review_text?: string;
  review_type: 'business_to_creator' | 'creator_to_business' | 'brand_to_business' | 'business_to_brand';
  communication_rating?: number;
  quality_rating?: number;
  timeliness_rating?: number;
  professionalism_rating?: number;
  is_public?: boolean;
}

export interface RatingStats {
  average_rating: number;
  total_reviews: number;
  rating_breakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
