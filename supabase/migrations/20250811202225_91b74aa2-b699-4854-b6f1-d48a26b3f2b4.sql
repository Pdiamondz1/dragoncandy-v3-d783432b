-- Drop the existing restrictive policy that only allows users to see their own campaigns
DROP POLICY "Users can only view their own campaigns" ON campaigns;

-- Create a new policy that allows viewing own campaigns OR published campaigns
CREATE POLICY "Users can view own campaigns or published campaigns" 
  ON campaigns 
  FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    (status = 'published')
  );