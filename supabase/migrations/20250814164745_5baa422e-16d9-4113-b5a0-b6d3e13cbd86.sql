-- Allow business clients to view deliverable files for campaigns they own
CREATE POLICY "Business clients can view deliverables for their campaigns" 
ON public.file_uploads 
FOR SELECT 
USING (
  campaign_id IS NOT NULL AND 
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = file_uploads.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);