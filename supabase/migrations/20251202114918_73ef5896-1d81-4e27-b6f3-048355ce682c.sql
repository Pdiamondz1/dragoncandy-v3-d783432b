-- Migration 1: Add sponsorship support to project_reviews table

-- Make collaboration_id nullable (it was NOT NULL before)
ALTER TABLE project_reviews ALTER COLUMN collaboration_id DROP NOT NULL;

-- Add sponsorship_id column
ALTER TABLE project_reviews ADD COLUMN sponsorship_id UUID REFERENCES campaign_sponsorships(id);

-- Add CHECK constraint: must have either collaboration_id OR sponsorship_id (XOR)
ALTER TABLE project_reviews ADD CONSTRAINT review_reference_check 
  CHECK (
    (collaboration_id IS NOT NULL AND sponsorship_id IS NULL) OR 
    (collaboration_id IS NULL AND sponsorship_id IS NOT NULL)
  );

-- Update review_type CHECK to include new types
ALTER TABLE project_reviews DROP CONSTRAINT IF EXISTS project_reviews_review_type_check;
ALTER TABLE project_reviews ADD CONSTRAINT project_reviews_review_type_check 
  CHECK (review_type IN ('business_to_creator', 'creator_to_business', 'brand_to_business', 'business_to_brand'));

-- Migration 2: Add completion tracking to campaign_sponsorships table

-- Add completion status columns (matching the pattern from campaign_collaborations)
ALTER TABLE campaign_sponsorships 
  ADD COLUMN brand_completion_status TEXT DEFAULT 'pending',
  ADD COLUMN business_completion_status TEXT DEFAULT 'pending',
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN review_status TEXT DEFAULT 'pending';

-- Add CHECK constraints for status values
ALTER TABLE campaign_sponsorships ADD CONSTRAINT brand_completion_status_check 
  CHECK (brand_completion_status IN ('pending', 'requested', 'approved'));
  
ALTER TABLE campaign_sponsorships ADD CONSTRAINT business_completion_status_check 
  CHECK (business_completion_status IN ('pending', 'requested', 'approved'));
  
ALTER TABLE campaign_sponsorships ADD CONSTRAINT sponsorship_review_status_check 
  CHECK (review_status IN ('pending', 'completed', 'both_reviewed'));

-- RLS Policies: Add policies for brand and business sponsorship reviews

-- Brands can insert reviews for their sponsorships
CREATE POLICY "Brands can insert sponsorship reviews" ON project_reviews
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid() AND
    sponsorship_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM campaign_sponsorships cs
      JOIN business_profiles bp ON bp.id = cs.brand_id
      WHERE cs.id = project_reviews.sponsorship_id
      AND bp.user_id = auth.uid()
    )
  );

-- Businesses can insert reviews for sponsorships on their campaigns
CREATE POLICY "Businesses can insert sponsorship reviews" ON project_reviews
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid() AND
    sponsorship_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM campaign_sponsorships cs
      JOIN business_profiles bp ON bp.id = cs.restaurant_id
      WHERE cs.id = project_reviews.sponsorship_id
      AND bp.user_id = auth.uid()
    )
  );