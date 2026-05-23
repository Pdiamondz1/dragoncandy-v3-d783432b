
-- =========================================================
-- 1. org_units financial column hardening
-- =========================================================
REVOKE SELECT (stripe_account_id, stripe_onboarding_complete, pending_balance)
  ON public.org_units FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_org_unit_financials(p_unit_id uuid)
RETURNS TABLE(
  stripe_account_id text,
  stripe_onboarding_complete boolean,
  pending_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT u.org_id INTO v_org_id FROM public.org_units u WHERE u.id = p_unit_id;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = v_org_id
      AND user_id = auth.uid()
      AND invitation_status = 'active'
      AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.stripe_account_id, u.stripe_onboarding_complete, u.pending_balance
  FROM public.org_units u
  WHERE u.id = p_unit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_unit_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_unit_financials(uuid) TO authenticated;

-- =========================================================
-- 2. profiles.email hardening
-- =========================================================
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_recipient_email(p_user_id uuid)
RETURNS TABLE(email text, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF v_caller = p_user_id THEN
    v_allowed := true;
  END IF;

  -- Messaging relationship: any message between the two parties
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1 FROM public.messages m
      WHERE (m.sender_id = v_caller AND m.recipient_id = p_user_id)
         OR (m.sender_id = p_user_id AND m.recipient_id = v_caller)
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Shared conversation
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1 FROM public.conversation_participants cp1
      JOIN public.conversation_participants cp2
        ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = v_caller
        AND cp2.user_id = p_user_id
        AND cp1.left_at IS NULL
        AND cp2.left_at IS NULL
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Campaign application / collaboration relationship
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1
      FROM public.campaign_applications ca
      JOIN public.campaigns c ON c.id = ca.campaign_id
      WHERE (ca.creator_id = v_caller AND c.user_id = p_user_id)
         OR (ca.creator_id = p_user_id AND c.user_id = v_caller)
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1
      FROM public.campaign_collaborations cc
      JOIN public.campaigns c ON c.id = cc.campaign_id
      WHERE (cc.creator_id = v_caller AND c.user_id = p_user_id)
         OR (cc.creator_id = p_user_id AND c.user_id = v_caller)
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Campaign invitation
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1
      FROM public.campaign_invitations ci
      JOIN public.campaigns c ON c.id = ci.campaign_id
      WHERE (ci.creator_id = v_caller AND c.user_id = p_user_id)
         OR (ci.creator_id = p_user_id AND c.user_id = v_caller)
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Sponsorship relationship: brand_id (business_profiles.id) <-> campaign owner
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1
      FROM public.campaign_sponsorships cs
      JOIN public.business_profiles bp ON bp.id = cs.brand_id
      JOIN public.campaigns c ON c.id = cs.campaign_id
      WHERE (bp.user_id = v_caller AND c.user_id = p_user_id)
         OR (bp.user_id = p_user_id AND c.user_id = v_caller)
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Shared active org membership
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1
      FROM public.org_members m1
      JOIN public.org_members m2 ON m1.org_id = m2.org_id
      WHERE m1.user_id = v_caller
        AND m2.user_id = p_user_id
        AND m1.invitation_status = 'active'
        AND m2.invitation_status = 'active'
      LIMIT 1
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.email, p.full_name
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_recipient_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recipient_email(uuid) TO authenticated;

-- =========================================================
-- 3. campaign_brief_generations.ip_address hardening
-- =========================================================
REVOKE SELECT (ip_address) ON public.campaign_brief_generations FROM anon, authenticated;

-- =========================================================
-- 4. profile_views integrity fix
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can insert profile views" ON public.profile_views;
CREATE POLICY "Authenticated users can insert profile views"
ON public.profile_views
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (viewer_id IS NULL OR viewer_id = auth.uid())
);
