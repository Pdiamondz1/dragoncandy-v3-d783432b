-- P0-2: Add missing DELETE policy on promotion_submissions.
-- Business owners can delete submissions for their own promotions
-- (e.g., to remove inappropriate content). Matches the existing
-- SELECT/UPDATE policy pattern.

CREATE POLICY "Business owners can delete submissions for their promotions"
ON public.promotion_submissions
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.promotions p
  WHERE p.id = promotion_submissions.promotion_id
  AND p.user_id = auth.uid()
));
