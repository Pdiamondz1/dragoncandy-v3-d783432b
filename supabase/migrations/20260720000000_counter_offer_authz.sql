-- Harden create_counter_offer: identity + participant + role-integrity authorization.
-- It was SECURITY DEFINER with anon:EXECUTE and ZERO authz — any caller (incl. anon) could
-- flip a stranger's application to counter_offered, decline its pending offers, and insert an
-- offer under any sender_id/sender_role, bypassing RLS. Escalation: forge an offer AS the
-- counterparty, then self-accept. See docs/wiki/concepts/service-role-data-exposure.md.
-- CREATE OR REPLACE with the IDENTICAL 6-arg signature: the sole caller
-- (src/hooks/useCounterOffers.ts) and generated types.ts are untouched.

CREATE OR REPLACE FUNCTION public.create_counter_offer(
  p_application_id uuid,
  p_sender_id uuid,
  p_sender_role text,
  p_proposed_rate numeric DEFAULT NULL,
  p_proposed_timeline text DEFAULT NULL,
  p_message text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app   record;
  v_offer record;
  v_owner uuid;
  v_role  text;
BEGIN
  -- 1. Identity — BEFORE the row lock, so anon/unauthorized never take a lock.
  --    Mirrors apply_to_campaign (20260521000002:21). auth.uid() is NULL for anon,
  --    so NULL IS DISTINCT FROM <any uuid> = TRUE -> rejected.
  IF auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized: sender_id must match authenticated user';
  END IF;

  -- Lock the application row to serialize concurrent counter-offers.
  SELECT * INTO v_app
    FROM campaign_applications
    WHERE id = p_application_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- 2. Participant + derive role (server truth — never trust p_sender_role).
  SELECT user_id INTO v_owner FROM campaigns WHERE id = v_app.campaign_id;

  IF    auth.uid() = v_app.creator_id THEN v_role := 'creator';   -- first-branch precedence:
  ELSIF auth.uid() = v_owner          THEN v_role := 'business';  -- self-application -> 'creator' (benign)
  ELSE  RAISE EXCEPTION 'Unauthorized: not a participant on this application';
  END IF;

  -- 3. Role integrity — reject a forged/mismatched client role.
  IF p_sender_role IS DISTINCT FROM v_role THEN
    RAISE EXCEPTION 'Unauthorized: sender_role does not match your role on this application';
  END IF;

  -- Update application status.
  UPDATE campaign_applications
    SET status = 'counter_offered', updated_at = now()
    WHERE id = p_application_id;

  -- Decline ALL pending counter-offers on this application.
  UPDATE application_counter_offers
    SET status = 'declined', updated_at = now()
    WHERE application_id = p_application_id
      AND status = 'pending';

  -- Insert the new counter-offer — sender_id + role are SERVER-DERIVED, not client-supplied.
  INSERT INTO application_counter_offers (
    application_id, sender_id, sender_role,
    proposed_rate, proposed_timeline, message, status
  )
  VALUES (
    p_application_id, auth.uid(), v_role,
    p_proposed_rate, p_proposed_timeline, p_message, 'pending'
  )
  -- Explicit column list (not RETURNING *): this is an RLS-bypassing definer path, so a
  -- future sensitive column on the table must not silently surface to the client. Matches
  -- the CounterOffer frontend type exactly.
  RETURNING id, application_id, sender_id, sender_role, proposed_rate, proposed_timeline,
            message, status, created_at
    INTO v_offer;

  RETURN row_to_json(v_offer);
END;
$$;

-- Grant tightening: remove anon (and public) EXECUTE; keep authenticated + service_role.
-- Defense-in-depth over the auth.uid() guard. Per project_supabase_definer_revoke_anon,
-- revoking only `public` does NOT lock a definer fn — revoke `anon` explicitly too.
REVOKE EXECUTE ON FUNCTION public.create_counter_offer(uuid, uuid, text, numeric, text, text)
  FROM anon, public;

-- Sibling RLS: the INSERT policy constrained sender_id but NOT sender_role, so a hand-crafted
-- REST insert on the direct-insert apply-time path (useCreateApplication.ts:107) could label a
-- creator's row 'business' (display-only, but same forged-role class). Recreate with the role
-- pinned. DROP POLICY / CREATE POLICY on a POLICY is the standard reversible amend (not a
-- table/column drop). Name matches the live policy exactly.
DROP POLICY IF EXISTS "Users can create counter-offers for their applications"
  ON public.application_counter_offers;

CREATE POLICY "Users can create counter-offers for their applications"
ON public.application_counter_offers FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
  AND sender_role = CASE
    WHEN EXISTS (
      SELECT 1 FROM campaign_applications ca
      WHERE ca.id = application_counter_offers.application_id
        AND ca.creator_id = auth.uid()
    ) THEN 'creator' ELSE 'business' END
);
