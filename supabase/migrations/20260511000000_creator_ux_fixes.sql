-- 1a: Fix campaigns RLS policy — grant creators read access for campaigns
-- they have collaborations on (fixes Projects page crash)
DROP POLICY IF EXISTS "Users can view own campaigns or published campaigns" ON campaigns;
CREATE POLICY "Users can view accessible campaigns" ON campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR status = 'published'
  OR EXISTS (
    SELECT 1 FROM campaign_collaborations
    WHERE campaign_collaborations.campaign_id = campaigns.id
      AND campaign_collaborations.creator_id = auth.uid()
  )
);

-- 1b: Composite index for the EXISTS subquery performance
CREATE INDEX IF NOT EXISTS idx_campaign_collaborations_campaign_creator
  ON campaign_collaborations(campaign_id, creator_id);

-- 1c: Add revision_feedback JSONB column
ALTER TABLE campaign_collaborations
  ADD COLUMN IF NOT EXISTS revision_feedback JSONB DEFAULT NULL;

-- 1d: Update check_prerequisite_status RPC — creators always pass social check
CREATE OR REPLACE FUNCTION check_prerequisite_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  IF v_role = 'content_creator' THEN
    SELECT jsonb_build_object(
      'role', v_role,
      'profile_complete', (
        creator_name IS NOT NULL AND creator_name != '' AND
        bio IS NOT NULL AND bio != '' AND
        avatar_url IS NOT NULL AND avatar_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM creator_profiles WHERE id = p_user_id;
  ELSE
    SELECT jsonb_build_object(
      'role', COALESCE(account_type, 'business_client'),
      'profile_complete', (
        business_name IS NOT NULL AND business_name != '' AND
        description IS NOT NULL AND description != '' AND
        logo_url IS NOT NULL AND logo_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM business_profiles WHERE id = p_user_id;
  END IF;

  result = result || jsonb_build_object(
    'social_connected',
    CASE WHEN v_role = 'content_creator' THEN true
    ELSE EXISTS(SELECT 1 FROM business_outstand_accounts WHERE user_id = p_user_id)
    END
  );

  RETURN COALESCE(result, '{"role":"unknown","profile_complete":false,"social_connected":false,"stripe_complete":false}'::jsonb);
END;
$$;
