
-- Create reviews and ratings tables
CREATE TABLE public.project_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES public.campaign_collaborations(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_type TEXT NOT NULL CHECK (review_type IN ('business_to_creator', 'creator_to_business')),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
  professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(collaboration_id, reviewer_id, reviewee_id)
);

-- Create review responses table
CREATE TABLE public.review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.project_reviews(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add rating fields to profile tables
ALTER TABLE public.creator_profiles 
ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- Add review status to collaborations
ALTER TABLE public.campaign_collaborations 
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'completed', 'both_reviewed'));

-- Enable RLS on new tables
ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_reviews
CREATE POLICY "Users can view public reviews" 
  ON public.project_reviews FOR SELECT 
  USING (is_public = true);

CREATE POLICY "Users can view their own reviews" 
  ON public.project_reviews FOR SELECT 
  USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id);

CREATE POLICY "Users can create reviews for their collaborations" 
  ON public.project_reviews FOR INSERT 
  WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM public.campaign_collaborations cc 
      WHERE cc.id = collaboration_id 
      AND (cc.creator_id = auth.uid() OR 
           cc.campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid()))
    )
  );

CREATE POLICY "Users can update their own reviews" 
  ON public.project_reviews FOR UPDATE 
  USING (auth.uid() = reviewer_id);

-- RLS policies for review_responses
CREATE POLICY "Users can view responses to public reviews" 
  ON public.review_responses FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.project_reviews pr 
      WHERE pr.id = review_id AND pr.is_public = true
    )
  );

CREATE POLICY "Users can view responses to their reviews" 
  ON public.review_responses FOR SELECT 
  USING (
    auth.uid() = responder_id OR
    EXISTS (
      SELECT 1 FROM public.project_reviews pr 
      WHERE pr.id = review_id AND (pr.reviewer_id = auth.uid() OR pr.reviewee_id = auth.uid())
    )
  );

CREATE POLICY "Users can respond to reviews about them" 
  ON public.review_responses FOR INSERT 
  WITH CHECK (
    auth.uid() = responder_id AND
    EXISTS (
      SELECT 1 FROM public.project_reviews pr 
      WHERE pr.id = review_id AND pr.reviewee_id = auth.uid()
    )
  );

-- Create function to update profile ratings
CREATE OR REPLACE FUNCTION public.update_profile_ratings()
RETURNS TRIGGER AS $$
BEGIN
  -- Update creator profile ratings
  IF NEW.review_type = 'business_to_creator' THEN
    UPDATE public.creator_profiles 
    SET 
      average_rating = (
        SELECT ROUND(AVG(rating::numeric), 2) 
        FROM public.project_reviews 
        WHERE reviewee_id = NEW.reviewee_id AND review_type = 'business_to_creator'
      ),
      total_reviews = (
        SELECT COUNT(*) 
        FROM public.project_reviews 
        WHERE reviewee_id = NEW.reviewee_id AND review_type = 'business_to_creator'
      )
    WHERE user_id = NEW.reviewee_id;
  END IF;

  -- Update business profile ratings
  IF NEW.review_type = 'creator_to_business' THEN
    UPDATE public.business_profiles 
    SET 
      average_rating = (
        SELECT ROUND(AVG(rating::numeric), 2) 
        FROM public.project_reviews 
        WHERE reviewee_id = NEW.reviewee_id AND review_type = 'creator_to_business'
      ),
      total_reviews = (
        SELECT COUNT(*) 
        FROM public.project_reviews 
        WHERE reviewee_id = NEW.reviewee_id AND review_type = 'creator_to_business'
      )
    WHERE user_id = NEW.reviewee_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update ratings
CREATE TRIGGER update_profile_ratings_trigger
  AFTER INSERT OR UPDATE ON public.project_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_ratings();

-- Create indexes for performance
CREATE INDEX idx_project_reviews_reviewee_type ON public.project_reviews(reviewee_id, review_type);
CREATE INDEX idx_project_reviews_collaboration ON public.project_reviews(collaboration_id);
CREATE INDEX idx_project_reviews_public ON public.project_reviews(is_public, created_at DESC);
CREATE INDEX idx_review_responses_review ON public.review_responses(review_id);

-- Add updated_at trigger to new tables
CREATE TRIGGER handle_updated_at_project_reviews
  BEFORE UPDATE ON public.project_reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_review_responses
  BEFORE UPDATE ON public.review_responses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
