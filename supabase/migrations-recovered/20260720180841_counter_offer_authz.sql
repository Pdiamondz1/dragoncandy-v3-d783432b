-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260720180841 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Harden create_counter_offer: identity + participant + role-integrity authorization.
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
  IF auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'Unauthorized: sender_id must match authenticated user';
  END IF;

  SELECT * INTO v_app
    FROM campaign_applications
    WHERE id = p_application_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- 2. Participant + derive role (server truth — never trust p_sender_role).
  SELECT user_id INTO v_owner FROM campaigns WHERE id = v_app.campaign_id;

  IF    auth.uid() = v_app.creator_id THEN v_role := 'creator';
  ELSIF auth.uid() = v_owner          THEN v_role := 'business';
  ELSE  RAISE EXCEPTION 'Unauthorized: not a participant on this application';
  END IF;

  -- 3. Role integrity — reject a forged/mismatched client role.
  IF p_sender_role IS DISTINCT FROM v_role THEN
    RAISE EXCEPTION 'Unauthorized: sender_role does not match your role on this application';
  END IF;

  UPDATE campaign_applications
    SET status = 'counter_offered', updated_at = now()
    WHERE id = p_application_id;

  UPDATE application_counter_offers
    SET status = 'declined', updated_at = now()
    WHERE application_id = p_application_id
      AND status = 'pending';

  INSERT INTO application_counter_offers (
    application_id, sender_id, sender_role,
    proposed_rate, proposed_timeline, message, status
  )
  VALUES (
    p_application_id, auth.uid(), v_role,
    p_proposed_rate, p_proposed_timeline, p_message, 'pending'
  )
  RETURNING * INTO v_offer;

  RETURN row_to_json(v_offer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_counter_offer(uuid, uuid, text, numeric, text, text)
  FROM anon, public;

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
