-- Package-order money-rail RPCs. Depends on 20260804120100_package_orders_tables.sql.
--   • credit_pending_balance_for_order — the package sibling of credit_pending_balance_for_payout: the
--     shared wallet-first payout core calls it to credit-at-most-once (row-locked, durable marker).
--   • create_package_order — atomic validate-published + snapshot + insert order+intake, idempotent on an
--     unpaid draft. Called by the create-package-order-escrow edge function (service role).
--   • get_guest_order_by_token — lets a no-account (guest) buyer read ONLY their own order, by bearer token.
-- transition_package_order_status + the client content-event writer land in the v1c delivery layer.

-- ── credit_pending_balance_for_order (server-only; mirrors credit_pending_balance_for_payout) ─────────
CREATE OR REPLACE FUNCTION public.credit_pending_balance_for_order(
  p_order_id uuid,
  p_user_id uuid,
  p_amount numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already boolean;
  v_creator_id uuid;
  caller_role text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'credit_pending_balance_for_order is server-only';
  END IF;

  -- Row-lock the order so concurrent payout invocations serialize; the lock + marker check + both UPDATEs
  -- are one atomic transaction (credit-at-most-once).
  SELECT (payout_executed_at IS NOT NULL), creator_id
  INTO v_already, v_creator_id
  FROM package_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_order % not found', p_order_id;
  END IF;

  -- The wallet-credit target MUST be this order's own creator (blocks a mis-wired caller crediting an
  -- unrelated user against this order).
  IF v_creator_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'p_user_id % does not match order % creator %', p_user_id, p_order_id, v_creator_id;
  END IF;

  IF v_already THEN
    RETURN 'already';
  END IF;

  UPDATE creator_profiles
  SET pending_balance = COALESCE(pending_balance, 0) + p_amount
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator_profiles row not found for user % — cannot credit pending balance', p_user_id;
  END IF;

  UPDATE package_orders
  SET payout_executed_at = now()
  WHERE id = p_order_id;

  RETURN 'credited';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.credit_pending_balance_for_order(uuid, uuid, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_pending_balance_for_order(uuid, uuid, numeric) TO service_role;

COMMENT ON FUNCTION public.credit_pending_balance_for_order(uuid, uuid, numeric) IS
  'Atomic credit-and-mark for a package order payout: row-locks the order, credits creator_profiles.pending_balance and sets payout_executed_at in one transaction, returns ''credited'' or ''already''. Service-role only. Package sibling of credit_pending_balance_for_payout.';

-- ── create_package_order (server-only; atomic create + snapshot + idempotent) ─────────────────────────
CREATE OR REPLACE FUNCTION public.create_package_order(
  p_package_id uuid,
  p_intake jsonb DEFAULT '{}'::jsonb,
  p_buyer_user_id uuid DEFAULT NULL,
  p_buyer_org_id uuid DEFAULT NULL,
  p_buyer_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text;
  v_pkg record;
  v_order_id uuid;
  v_guest_token text;
  v_fee_rate numeric := 0.10;  -- PACKAGE_FEE_RATE — keep in sync with supabase/functions/_shared/platform-fee.ts
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'create_package_order is server-only';
  END IF;

  IF p_buyer_user_id IS NULL AND p_buyer_email IS NULL THEN
    RAISE EXCEPTION 'a buyer principal (user id or email) is required';
  END IF;

  -- Load the package AND authorize purchasability in one lookup: it must be published AND owned by a PUBLIC
  -- creator — the same predicate the public_creator_packages read path enforces, so this definer caller can
  -- never create an order (and mint a working guest token) for something a buyer couldn't have reached
  -- (drafts, paused, or a private creator's listing). The generic error avoids leaking whether an unlisted
  -- package exists. Selling while fully unlisted is a deliberate future extension (needs a slug-keyed read
  -- path + a relaxed gate), not a silent hole here.
  SELECT cp.* INTO v_pkg
  FROM creator_packages cp
  JOIN creator_profiles pr ON pr.user_id = cp.creator_id
  WHERE cp.id = p_package_id
    AND cp.status = 'published'
    AND pr.profile_visibility = 'public';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package % is not available for purchase', p_package_id;
  END IF;

  -- Guests (no account) get a strong opaque bearer token (two concatenated v4 UUIDs = 244 bits, no pgcrypto
  -- dependency) to view/approve their order; authenticated buyers never get one. We deliberately never key
  -- reuse on a guest's unverified email — that would hand a caller another guest's token and let them clobber
  -- that guest's intake (data-exposure review, 2026-08-04).
  v_guest_token := CASE
    WHEN p_buyer_user_id IS NULL
      THEN replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    ELSE NULL
  END;

  -- Atomic idempotency for AUTHENTICATED checkout via the partial unique index
  -- idx_package_orders_one_pending_per_buyer: a concurrent OR retried checkout for the same (package, buyer,
  -- org) collapses to ONE pending order and REFRESHES its commercial snapshots to the package's CURRENT terms
  -- (so a package edit between attempts can never sell stale price/scope). The ON CONFLICT arbiter is that
  -- partial index, which EXCLUDES guests (buyer_user_id NULL) — so a guest always inserts a fresh order.
  INSERT INTO package_orders (
    package_id, creator_id, buyer_user_id, buyer_org_id, buyer_email, buyer_guest_token,
    price_snapshot, platform_fee_snapshot, turnaround_days_snapshot, scope_snapshot,
    escrow_status, order_status
  ) VALUES (
    p_package_id, v_pkg.creator_id, p_buyer_user_id, p_buyer_org_id, p_buyer_email, v_guest_token,
    v_pkg.price, round(v_pkg.price * v_fee_rate, 2), v_pkg.turnaround_days, v_pkg.scope,
    'pending', 'pending_payment'
  )
  ON CONFLICT (package_id, buyer_user_id, buyer_org_id)
    WHERE (order_status = 'pending_payment' AND buyer_user_id IS NOT NULL)
  DO UPDATE SET
    price_snapshot           = EXCLUDED.price_snapshot,
    platform_fee_snapshot    = EXCLUDED.platform_fee_snapshot,
    turnaround_days_snapshot = EXCLUDED.turnaround_days_snapshot,
    scope_snapshot           = EXCLUDED.scope_snapshot,
    updated_at               = now()
  RETURNING id INTO v_order_id;

  -- Upsert intake alongside (new order → insert; reused pending order → refresh to the latest answers). Also
  -- populate the promoted scalars (shoot_date/address) the scheduling & notification paths filter on, pulled
  -- from the standard intake field ids — with a defensive date guard so a malformed value yields NULL instead
  -- of aborting the whole order.
  INSERT INTO package_order_intake (order_id, answers, schema_version, shoot_date, address)
  VALUES (
    v_order_id,
    COALESCE(p_intake, '{}'::jsonb),
    v_pkg.intake_schema_version,
    CASE WHEN p_intake->>'shoot_date' ~ '^\d{4}-\d{2}-\d{2}'
         THEN left(p_intake->>'shoot_date', 10)::date ELSE NULL END,
    NULLIF(p_intake->>'address', '')
  )
  ON CONFLICT (order_id) DO UPDATE
    SET answers        = EXCLUDED.answers,
        schema_version = EXCLUDED.schema_version,
        shoot_date     = EXCLUDED.shoot_date,
        address        = EXCLUDED.address;

  RETURN jsonb_build_object('order_id', v_order_id, 'guest_token', v_guest_token);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_package_order(uuid, jsonb, uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_package_order(uuid, jsonb, uuid, uuid, text) TO service_role;

-- ── get_guest_order_by_token (guest-facing; token-scoped; leaks nothing else) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_guest_order_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  -- Reject trivially short/empty tokens outright; a real token is 64 hex chars.
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    -- Curated, buyer-relevant fields only — never the token, never creator payout internals.
    'order', jsonb_build_object(
      'id', po.id,
      'order_status', po.order_status,
      'escrow_status', po.escrow_status,
      'content_status', po.content_status,
      'content_submitted_at', po.content_submitted_at,
      'revision_count', po.revision_count,
      'completed_at', po.completed_at,
      'created_at', po.created_at,
      'price', po.price_snapshot
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

  RETURN v;  -- NULL when the token matches nothing
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_guest_order_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_guest_order_by_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_guest_order_by_token(text) IS
  'Guest order lookup by opaque bearer token. Returns a curated buyer-facing view (no token, no creator payout internals) for the single order matching the token, or NULL. The token is the access credential.';
