-- P2 fixes (Codex round 2): the group-member branches gated on membership only, so a
-- crew campaign that left 'published' (accepted -> 'active', or a grouped draft) stayed
-- visible/appliable to non-selected active members — unlike public campaigns, which are
-- only exposed while 'published'. Add the published-status gate to the membership path in
-- both the SELECT policy and the apply RPC. The owner (user_id) and the selected
-- collaborator (has_collaboration_on_campaign) keep access after it goes active; the
-- explicit pending-invitation path is preserved.

-- (a) SELECT policy: published + (public OR active member); owner/collaborator unchanged.
DROP POLICY IF EXISTS "Users can view accessible campaigns" ON public.campaigns;
CREATE POLICY "Users can view accessible campaigns" ON public.campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR (status = 'published' AND (group_id IS NULL OR public.is_active_group_member(group_id, auth.uid())))
  OR public.has_collaboration_on_campaign(id, auth.uid())
);

-- (b) apply_to_campaign: the membership path additionally requires status = 'published';
--     the pending-invitation path is unchanged (invited creators may still apply to a
--     non-published campaign, matching existing public-invite semantics).
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
  -- Enforce caller is the creator
  IF auth.uid() IS DISTINCT FROM p_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: creator_id must match authenticated user';
  END IF;

  -- Group campaigns: an active member may apply only while the campaign is 'published';
  -- an explicitly pending-invited creator may still apply (existing invite semantics).
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND group_id IS NOT NULL) THEN
    IF NOT (
         (public.is_active_group_member(
            (SELECT group_id FROM campaigns WHERE id = p_campaign_id), p_creator_id)
          AND EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND status = 'published'))
      OR EXISTS (SELECT 1 FROM campaign_invitations
                 WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
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
