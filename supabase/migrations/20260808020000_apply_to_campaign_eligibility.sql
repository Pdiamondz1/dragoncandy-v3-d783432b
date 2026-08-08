-- apply_to_campaign: honour the same eligibility rule its own RLS policy carries.
--
-- The `campaign_applications` INSERT policy is:
--   WITH CHECK (auth.uid() = creator_id AND can_create_application(campaign_id, auth.uid()))
--
-- but `apply_to_campaign` is SECURITY DEFINER, so it bypasses that policy — and it only
-- ever checked eligibility on the `group_id IS NOT NULL` branch. For an ordinary campaign
-- it fell straight through to the INSERT with no status check and no role check, while
-- holding EXECUTE for `authenticated`.
--
-- Proved on prod 2026-08-08 inside a rolled-back transaction: a real creator with no
-- invitation applied successfully to an **active** campaign (one that already has a hired
-- creator) — `applied_anyway=t`. Reachable for draft / active / completed / cancelled
-- campaigns alike, injecting rows into another business's applicant list and firing them
-- an owner notification. (`anon` also holds EXECUTE but is stopped by the existing
-- `auth.uid() IS DISTINCT FROM p_creator_id` guard.)
--
-- This is the shorter path to the same outcome that migration 20260808010000 closed for
-- invitations, so that fix is only half a fix without this one.
--
-- The rule is not re-invented here: `can_create_application` already encodes it
-- (role = content_creator, AND published-non-group OR published-group-with-membership OR
-- non-group-with-pending-invitation). Calling it keeps the RPC and the policy in lockstep.
--
-- The extra OR is deliberate: this RPC is an UPSERT (`ON CONFLICT ... DO UPDATE`), so it is
-- also how a creator amends an application they already legitimately hold — including a
-- counter-offer after the campaign has left `published`, where `can_create_application`
-- would now say no. Gating only the creation of NEW applications preserves that, and a
-- `rejected` row is excluded so it cannot be used to re-enter through the back door.
--
-- The group branch is left byte-identical so its distinct error message is preserved.

CREATE OR REPLACE FUNCTION public.apply_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_proposed_rate numeric,
  p_intro_message text,
  p_proposed_timeline text DEFAULT NULL::text,
  p_is_counter_offer boolean DEFAULT false,
  p_portfolio_url text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app_status application_status;
  v_app record;
  v_invitation_status text;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: creator_id must match authenticated user';
  END IF;

  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND group_id IS NOT NULL) THEN
    IF NOT (
         public.is_active_group_member(
           (SELECT group_id FROM campaigns WHERE id = p_campaign_id), p_creator_id)
         AND EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id AND status = 'published')
    ) THEN
      RAISE EXCEPTION 'Not eligible to apply to this group campaign';
    END IF;
  ELSE
    -- Non-group campaigns had NO eligibility check at all before this migration.
    IF NOT (
         public.can_create_application(p_campaign_id, p_creator_id)
         OR EXISTS (
              SELECT 1 FROM campaign_applications
              WHERE campaign_id = p_campaign_id
                AND creator_id  = p_creator_id
                AND status <> 'rejected'
            )
    ) THEN
      RAISE EXCEPTION 'Not eligible to apply to this campaign';
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
    proposed_rate     = EXCLUDED.proposed_rate,
    intro_message     = EXCLUDED.intro_message,
    proposed_timeline = EXCLUDED.proposed_timeline,
    status            = EXCLUDED.status,
    portfolio_url     = EXCLUDED.portfolio_url,
    updated_at        = now()
  RETURNING * INTO v_app;

  v_invitation_status := CASE WHEN p_is_counter_offer THEN 'counter_offered' ELSE 'accepted' END;

  UPDATE campaign_invitations
    SET status = v_invitation_status, updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND creator_id = p_creator_id
      AND status = 'pending';

  RETURN row_to_json(v_app);
END;
$function$;

-- `anon` cannot satisfy the auth.uid() guard, but it has no business holding EXECUTE.
REVOKE EXECUTE ON FUNCTION public.apply_to_campaign(uuid, uuid, numeric, text, text, boolean, text) FROM anon;
