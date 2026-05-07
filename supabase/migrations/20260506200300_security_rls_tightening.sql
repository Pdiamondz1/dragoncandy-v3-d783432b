-- Security fixes #10, #11, #12, #13, #14 — RLS tightening

-- ============================================================
-- #10: profile_views — restrict anonymous INSERT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert profile views" ON public.profile_views;
DROP POLICY IF EXISTS "Profile views are insertable by anyone" ON public.profile_views;

CREATE POLICY "profile_views: authenticated insert"
ON public.profile_views FOR INSERT
TO authenticated
WITH CHECK (viewer_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_views_hourly
ON public.profile_views (viewer_id, profile_id, (date_trunc('hour', viewed_at AT TIME ZONE 'UTC')));

-- ============================================================
-- #11: analytics_events — restrict anonymous INSERT
-- ============================================================
DROP POLICY IF EXISTS "Analytics events are insertable by anyone" ON public.analytics_events;

CREATE POLICY "analytics_events: authenticated insert"
ON public.analytics_events FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- #12: user_presence — restrict SELECT to conversation participants
-- ============================================================
DROP POLICY IF EXISTS "Users can view all presence" ON public.user_presence;
DROP POLICY IF EXISTS "Anyone can read presence" ON public.user_presence;

CREATE POLICY "user_presence: self or conversation peer"
ON public.user_presence FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp1
    JOIN conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = auth.uid()
      AND cp2.user_id = user_presence.user_id
      AND cp1.left_at IS NULL
      AND cp2.left_at IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_active
ON public.conversation_participants (conversation_id, user_id)
WHERE left_at IS NULL;

-- ============================================================
-- #13: campaign_sponsorships — narrow UPDATE to per-role
-- ============================================================
DROP POLICY IF EXISTS "Brands and restaurants can update sponsorships" ON public.campaign_sponsorships;

CREATE POLICY "sponsorships: brand update"
ON public.campaign_sponsorships FOR UPDATE
TO authenticated
USING (
  brand_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "sponsorships: restaurant update"
ON public.campaign_sponsorships FOR UPDATE
TO authenticated
USING (
  restaurant_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
  OR campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid()
  )
);

-- ============================================================
-- #14: email_verification_tokens — deny client writes
-- ============================================================
-- verify-email edge function uses service-role client (bypasses RLS).
-- Block all authenticated/anon access.
CREATE POLICY "email_verif: deny client writes"
ON public.email_verification_tokens FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
