-- Extend the append-only payment_events ledger to the package-order money rail (entity_type =
-- 'package_order'). The shared wallet-first payout core writes 'package_order' events server-side (service
-- role), so the CHECK must allow the value; participants read their own order's ledger via the SELECT policy.
-- Mirrors the constraint edit in 20260510000001_rush_invoice_tracking.sql. Depends on
-- 20260804120100_package_orders_tables.sql.

ALTER TABLE payment_events DROP CONSTRAINT payment_events_entity_type_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_entity_type_check
  CHECK (entity_type IN ('collaboration', 'sponsorship', 'rush', 'package_order'));

-- Package-order participants (the creator paid, or a logged-in buyer) can view that order's ledger. Guests
-- read order state via get_guest_order_by_token, never payment_events directly. Append-only: no UPDATE/DELETE.
CREATE POLICY "Package order participants can view payment events"
  ON payment_events FOR SELECT
  USING (
    entity_type = 'package_order' AND EXISTS (
      SELECT 1 FROM public.package_orders po
      WHERE po.id = entity_id
        AND (po.creator_id = auth.uid() OR po.buyer_user_id = auth.uid())
    )
  );

-- Close the write hole that widening the CHECK would otherwise open: the client-safe insert_payment_event
-- RPC authorizes only 'collaboration' and FALLS THROUGH to INSERT for every other entity_type, so allowing
-- 'package_order' above would let any authenticated client forge content events for arbitrary orders. Package
-- content events stay SERVER-ONLY in v1a; the v1c delivery layer replaces this rejection with a proper
-- participant-authorized branch. Re-declared verbatim from the live prod definition (verified via
-- pg_get_functiondef 2026-08-04) plus the one rejection branch — nothing else changes.
CREATE OR REPLACE FUNCTION public.insert_payment_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_campaign_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_event_type NOT IN ('content_started', 'content_submitted', 'revision_requested', 'content_resubmitted') THEN
    RAISE EXCEPTION 'Invalid event type: %. Only content events allowed from client.', p_event_type;
  END IF;

  IF p_entity_type = 'collaboration' THEN
    IF NOT EXISTS (
      SELECT 1 FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.id = p_entity_id
      AND (cc.creator_id = auth.uid() OR c.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  -- package_order content events are NOT client-writable in v1a (server-role only); v1c adds the
  -- participant-authorized branch. Reject to keep the fall-through insert below closed for this entity_type.
  IF p_entity_type = 'package_order' THEN
    RAISE EXCEPTION 'package_order events are not client-writable';
  END IF;

  INSERT INTO payment_events (event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, metadata)
  VALUES (
    p_event_type, p_entity_type, p_entity_id, p_campaign_id, auth.uid(),
    (SELECT CASE
      WHEN role = 'content_creator' THEN 'creator'
      WHEN role = 'business_client' THEN 'business'
      WHEN role = 'brand' THEN 'brand'
      ELSE 'business'
    END FROM profiles WHERE id = auth.uid()),
    p_metadata
  );
END;
$function$;
