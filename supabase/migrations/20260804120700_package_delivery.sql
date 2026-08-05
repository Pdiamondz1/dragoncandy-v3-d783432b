-- Creator Storefront — Productized Service Packages (v1d): the DELIVERY layer.
-- Closes the deliver→approve→payout loop. The v1a/v1c layers built escrow, guest checkout, the buyer's
-- approve/cancel actions, and the payout function — but there was no way for the CREATOR to actually submit
-- their work (flip content_status → 'submitted'), so the buyer's Approve button (gated on 'submitted') could
-- never activate. This migration adds:
--   • deliverable storage columns on package_orders (deliverables / delivery_note / revision_note)
--   • submit_package_deliverables — the creator delivers (in_progress|revision_requested → submitted)
--   • request_package_revision — the buyer/guest sends it back for one more pass (→ revision_requested)
--   • get_guest_order_by_token — REPLACED to surface the deliverables + notes to the buyer
-- Depends on 20260804120100_package_orders_tables.sql and 20260804120300_package_order_rpcs.sql.

-- ── Deliverable storage (forward ALTER; the create migrations stay immutable) ──────────────────────────
-- deliverables: an array of {url, label, kind} the creator submits. Links (Drive/Dropbox/YouTube/DragonShare
-- public URLs) OR uploaded-file public URLs both land here as plain URL strings — the storage source is a UI
-- concern, not a schema one. delivery_note: the creator's message with the work. revision_note: the buyer's
-- most-recent "please change X" (echoed to the creator on the order detail surface).
ALTER TABLE public.package_orders
  ADD COLUMN IF NOT EXISTS deliverables  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS revision_note text;

-- ── submit_package_deliverables (creator-facing; auth.uid() must own the order) ────────────────────────
-- The creator delivers their work. Callable by the authenticated CREATOR only (auth.uid() = creator_id). A
-- paid order sits at in_progress; a sent-back one at revision_requested — both are re-submittable. Flips the
-- order to 'submitted', which is exactly the state release-package-payout / the auto-approve cron gate on, so
-- this is the single action that arms the buyer's Approve. NOT a service-role RPC (unlike the money RPCs):
-- the creator triggers it directly from their dashboard.
CREATE OR REPLACE FUNCTION public.submit_package_deliverables(
  p_order_id uuid,
  p_deliverables jsonb,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_deliverables IS NULL
     OR jsonb_typeof(p_deliverables) <> 'array'
     OR jsonb_array_length(p_deliverables) < 1 THEN
    RAISE EXCEPTION 'at least one deliverable is required';
  END IF;

  -- Row-lock the order so a submit can't race an in-flight approve/refund on the same row.
  SELECT id, creator_id, escrow_status, order_status
  INTO v_order
  FROM package_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package order % not found', p_order_id;
  END IF;

  -- Only this order's creator may deliver.
  IF v_order.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the order creator can submit deliverables';
  END IF;

  -- Deliver only against a paid, in-flight order (or one sent back for a revision). This blocks delivering
  -- before payment (escrow still pending) and after the order has completed/refunded/cancelled.
  IF v_order.escrow_status <> 'held'
     OR v_order.order_status NOT IN ('in_progress', 'revision_requested') THEN
    RAISE EXCEPTION 'order % is not in a deliverable state (escrow=%, status=%)',
      p_order_id, v_order.escrow_status, v_order.order_status;
  END IF;

  UPDATE package_orders
  SET deliverables         = p_deliverables,
      delivery_note        = NULLIF(btrim(COALESCE(p_note, '')), ''),
      content_status       = 'submitted',
      content_submitted_at = now(),   -- (re)starts the auto-approve SLA clock on every (re)submission
      order_status         = 'submitted'
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'content_status', 'submitted');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_package_deliverables(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_package_deliverables(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.submit_package_deliverables(uuid, jsonb, text) IS
  'Creator delivers a package order: sets deliverables/delivery_note and flips content_status→submitted + order_status→submitted (arms the buyer Approve / auto-approve cron). Authenticated creator only (auth.uid()=creator_id); valid from in_progress or revision_requested while escrow is held.';

-- ── request_package_revision (buyer/guest-facing; sends submitted work back once) ──────────────────────
-- The buyer wants a change. Authorizes the logged-in buyer (auth.uid() = buyer_user_id) OR a guest holding
-- the order's bearer token. Valid only while work is 'submitted'. Moves the order to revision_requested,
-- clears content_status off the approvable set (so neither the buyer nor the cron can pay out a
-- being-revised order), bumps revision_count, and stores the buyer's note for the creator.
CREATE OR REPLACE FUNCTION public.request_package_revision(
  p_order_id uuid,
  p_note text,
  p_guest_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
  v_authorized boolean := false;
BEGIN
  SELECT id, buyer_user_id, buyer_guest_token, content_status, order_status
  INTO v_order
  FROM package_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package order % not found', p_order_id;
  END IF;

  -- Buyer authorization: the logged-in buyer, OR a guest presenting the exact order token. The token compare
  -- is length-guarded (a real token is 64 hex chars) so an empty/NULL token can never match.
  IF v_order.buyer_user_id IS NOT NULL AND v_order.buyer_user_id = auth.uid() THEN
    v_authorized := true;
  ELSIF p_guest_token IS NOT NULL
    AND length(p_guest_token) >= 32
    AND v_order.buyer_guest_token IS NOT NULL
    AND p_guest_token = v_order.buyer_guest_token THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized to request a revision on this order';
  END IF;

  -- A revision only makes sense against delivered-but-not-yet-approved work.
  IF v_order.content_status IS DISTINCT FROM 'submitted' OR v_order.order_status <> 'submitted' THEN
    RAISE EXCEPTION 'order % has no submitted work to revise (content_status=%, status=%)',
      p_order_id, v_order.content_status, v_order.order_status;
  END IF;

  UPDATE package_orders
  SET order_status   = 'revision_requested',
      content_status = 'rejected',              -- off the approvable set until the creator re-submits
      revision_count = revision_count + 1,
      revision_note  = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'order_status', 'revision_requested');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_package_revision(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_package_revision(uuid, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.request_package_revision(uuid, text, text) IS
  'Buyer/guest sends submitted package work back for one revision: order→revision_requested, content_status→rejected (blocks payout until re-submit), revision_count++, stores the note. Authorized by buyer auth.uid() or the guest order token. Valid only while work is submitted.';

-- ── get_guest_order_by_token — REPLACED to surface deliverables + notes to the buyer ───────────────────
-- Same curated, token-scoped, PII-safe contract as 20260804120300; now also returns the creator's submitted
-- deliverables + delivery_note (so the guest can review the work) and the buyer's own revision_note. Still
-- never exposes the token, creator payout internals, or another order's data.
CREATE OR REPLACE FUNCTION public.get_guest_order_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id', po.id,
      'order_status', po.order_status,
      'escrow_status', po.escrow_status,
      'content_status', po.content_status,
      'content_submitted_at', po.content_submitted_at,
      'revision_count', po.revision_count,
      'completed_at', po.completed_at,
      'created_at', po.created_at,
      'price', po.price_snapshot,
      'deliverables', po.deliverables,
      'delivery_note', po.delivery_note,
      'revision_note', po.revision_note
    ),
    'package', jsonb_build_object(
      'title', cp.title,
      'turnaround_days', po.turnaround_days_snapshot,
      'scope', po.scope_snapshot
    ),
    'intake', (SELECT poi.answers FROM package_order_intake poi WHERE poi.order_id = po.id)
  )
  INTO v
  FROM package_orders po
  JOIN creator_packages cp ON cp.id = po.package_id
  WHERE po.buyer_guest_token = p_token;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_guest_order_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_guest_order_by_token(text) TO anon, authenticated;
