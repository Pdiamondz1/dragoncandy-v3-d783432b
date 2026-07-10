-- P2 fixes (Codex): harden the private-crew backend invariants.
-- (a) A group campaign must be FREE — enforce fixed_price = 0 at the DB, not just in the
--     UI, so a stale/direct client write can't create a paid-looking private campaign that
--     downstream code treats as free (skips escrow) yet the accept RPC won't auto-activate.
-- (b) Group campaigns are MEMBERS-ONLY to apply — drop the pending-campaign_invitations
--     bypass for group campaigns in BOTH apply gates (the RPC and the RLS WITH CHECK). The
--     intended group flow creates no campaign_invitations, so this only closes the hole where
--     a regular invite surface could invite a non-member to a crew campaign. The invitation
--     branch is preserved for PUBLIC campaigns (its original purpose).

-- (a) Free-only constraint. All existing rows are group_id IS NULL, so this validates cleanly.
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_group_free CHECK (group_id IS NULL OR COALESCE(fixed_price, 0) = 0);

-- (b1) RLS WITH CHECK for direct campaign_applications inserts — invitation branch is
--      public-only now.
CREATE OR REPLACE FUNCTION public.can_create_application(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id AND role = 'content_creator')
    AND (
      EXISTS (SELECT 1 FROM public.campaigns
              WHERE id = p_campaign_id AND status = 'published' AND group_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.campaigns c
              WHERE c.id = p_campaign_id AND c.group_id IS NOT NULL
                AND c.status = 'published'
                AND public.is_active_group_member(c.group_id, p_creator_id))
      OR (
        EXISTS (SELECT 1 FROM public.campaigns WHERE id = p_campaign_id AND group_id IS NULL)
        AND EXISTS (SELECT 1 FROM public.campaign_invitations
                    WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
      )
    )
  );
$$;

-- (b2) apply_to_campaign RPC (the real gate — bypasses RLS): group branch is now members-only.
CREATE OR REPLACE FUNCTION apply_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_proposed_rate numeric,
  p_intro_message text,
  p_proposed_timeline text DEFAULT NULL,
  p_is_counter_offer boolean DEFAULT false,
  p_portfolio_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_status application_status;
  v_app record;
  v_invitation_status text;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: creator_id must match authenticated user';
  END IF;

  -- Group campaigns: an active member may apply only while the campaign is 'published'.
  -- No pending-invitation bypass for group campaigns (crew membership is the boundary).
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND group_id IS NOT NULL) THEN
    IF NOT (
         public.is_active_group_member(
           (SELECT group_id FROM campaigns WHERE id = p_campaign_id), p_creator_id)
         AND EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND status = 'published')
    ) THEN
      RAISE EXCEPTION 'Not eligible to apply to this group campaign';
    END IF;
  END IF;

  v_app_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'pending' END;

  INSERT INTO campaign_applications (
    campaign_id, creator_id, proposed_rate, intro_message,
    proposed_timeline, status, portfolio_url
  )
  VALUES (
    p_campaign_id, p_creator_id, p_proposed_rate, p_intro_message,
    p_proposed_timeline, v_app_status, p_portfolio_url
  )
  ON CONFLICT (campaign_id, creator_id) WHERE status <> 'rejected'
  DO UPDATE SET
    proposed_rate = EXCLUDED.proposed_rate,
    intro_message = EXCLUDED.intro_message,
    proposed_timeline = EXCLUDED.proposed_timeline,
    status = EXCLUDED.status,
    portfolio_url = EXCLUDED.portfolio_url,
    updated_at = now()
  RETURNING * INTO v_app;

  v_invitation_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'accepted' END;

  UPDATE campaign_invitations
    SET status = v_invitation_status, updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND creator_id = p_creator_id
      AND status = 'pending';

  RETURN row_to_json(v_app);
END;
$$;
