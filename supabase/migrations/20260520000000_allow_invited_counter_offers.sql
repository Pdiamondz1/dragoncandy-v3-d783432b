-- Allow invited creators to apply/counter-offer even on non-published campaigns
-- and add 'counter_offered' to campaign_invitations status

-- 1) Expand invitation status CHECK to include 'counter_offered'
ALTER TABLE public.campaign_invitations
  DROP CONSTRAINT IF EXISTS campaign_invitations_status_check;

ALTER TABLE public.campaign_invitations
  ADD CONSTRAINT campaign_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'counter_offered'));

-- 2) Replace INSERT policy on campaign_applications to allow invited creators
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
    AND (
      EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE id = campaign_id AND status = 'published'
      )
      OR
      EXISTS (
        SELECT 1 FROM public.campaign_invitations ci
        WHERE ci.campaign_id = campaign_applications.campaign_id
          AND ci.creator_id = auth.uid()
          AND ci.status = 'pending'
      )
    )
  );
