-- Restrict applications to published campaigns only (one-creator enforcement)
-- The original INSERT policy only checked creator role; this adds a campaign status check
-- so direct API calls can't bypass the UI "Position Filled" gate.

DROP POLICY IF EXISTS "Content creators can create applications" ON public.campaign_applications;

CREATE POLICY "Content creators can create applications"
  ON public.campaign_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'content_creator'
    )
    AND EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_id AND status = 'published'
    )
  );
