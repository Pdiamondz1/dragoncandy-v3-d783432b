
-- Restrict sensitive financial columns on profile tables from anon and authenticated roles
REVOKE SELECT (stripe_account_id, stripe_onboarding_complete, pending_balance) ON public.creator_profiles FROM anon, authenticated;
REVOKE SELECT (stripe_account_id, stripe_onboarding_complete, pending_balance) ON public.business_profiles FROM anon, authenticated;

-- Restrict org billing columns from regular members; edge functions use service role
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, billing_email, take_rate) ON public.organizations FROM anon, authenticated;

-- Hide email column on profiles from messaging contacts; users still get their own email via auth.users
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;

-- Tighten campaign-media storage policy to participants only
DROP POLICY IF EXISTS "Authenticated users can view campaign media" ON storage.objects;
CREATE POLICY "Campaign participants can view campaign media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-media' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE (c.id)::text = (storage.foldername(objects.name))[1]
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.campaign_collaborations cc
            WHERE cc.campaign_id = c.id AND cc.creator_id = auth.uid()
          )
        )
    )
  )
);

-- Mark previously-public campaign buckets as private
UPDATE storage.buckets SET public = false WHERE id IN ('campaign-media','campaign-files');
