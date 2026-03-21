-- Add completion tracking columns to campaign_collaborations
ALTER TABLE campaign_collaborations 
ADD COLUMN IF NOT EXISTS business_completion_status TEXT DEFAULT 'pending' CHECK (business_completion_status IN ('pending', 'requested', 'approved')),
ADD COLUMN IF NOT EXISTS creator_completion_status TEXT DEFAULT 'pending' CHECK (creator_completion_status IN ('pending', 'requested', 'approved')),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries on completion status
CREATE INDEX IF NOT EXISTS idx_campaign_collaborations_completion 
ON campaign_collaborations(business_completion_status, creator_completion_status) 
WHERE status = 'active';