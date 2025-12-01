-- Allow viewing profiles of users who have left public reviews
CREATE POLICY "Users can view profiles of public reviewers"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT reviewer_id FROM public.project_reviews WHERE is_public = true
  )
);