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
    'social_connected', EXISTS(
      SELECT 1 FROM business_outstand_accounts WHERE user_id = p_user_id
    )
  );

  RETURN COALESCE(result, '{"role":"unknown","profile_complete":false,"social_connected":false,"stripe_complete":false}'::jsonb);
END;
$$;
