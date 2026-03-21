-- Add DELETE policy for campaign_applications so creators can withdraw their own pending applications
CREATE POLICY "Creators can delete their own pending applications"
ON public.campaign_applications
FOR DELETE
USING (
  creator_id = auth.uid() 
  AND status = 'pending'
);