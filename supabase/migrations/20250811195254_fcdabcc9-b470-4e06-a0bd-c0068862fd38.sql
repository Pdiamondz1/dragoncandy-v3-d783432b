-- First, let's check the current policy and fix it
-- The issue is that when users are not authenticated, they might still see campaigns
-- We need to ensure only authenticated users can see campaigns, and only their own

-- Drop existing problematic policy
DROP POLICY IF EXISTS "Users can view published campaigns or their own campaigns" ON campaigns;

-- Create a proper policy that requires authentication and shows only user's own campaigns
CREATE POLICY "Users can only view their own campaigns" 
ON campaigns 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- Also ensure we have proper policies for other operations
-- Update policy for business clients creating campaigns
DROP POLICY IF EXISTS "Business clients can create campaigns" ON campaigns;
CREATE POLICY "Authenticated users can create campaigns" 
ON campaigns 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Update policy for updating campaigns
DROP POLICY IF EXISTS "Campaign owners can update their campaigns" ON campaigns;
CREATE POLICY "Users can update their own campaigns" 
ON campaigns 
FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Update policy for deleting campaigns  
DROP POLICY IF EXISTS "Campaign owners can delete their campaigns" ON campaigns;
CREATE POLICY "Users can delete their own campaigns" 
ON campaigns 
FOR DELETE 
TO authenticated
USING (user_id = auth.uid());