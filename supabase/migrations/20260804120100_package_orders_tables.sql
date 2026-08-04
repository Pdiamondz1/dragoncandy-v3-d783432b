-- Creator Storefront — Productized Service Packages (v1): ORDER layer.
-- package_orders (a purchase; its own escrow → deliver → dual-approve → payout state, mirroring the
-- campaign_collaborations money/delivery columns) + package_order_intake (the buyer's answers). Buyers may
-- be an on-platform business account OR a guest email (no account) reached via a shareable link — hence
-- buyer_user_id nullable + buyer_guest_token. Depends on 20260804120000_package_catalog_tables.sql.

CREATE TABLE public.package_orders (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id                 uuid NOT NULL REFERENCES public.creator_packages(id) ON DELETE RESTRICT,
  creator_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,  -- denormalized payee (survives package edits)
  -- buyer: a logged-in account (buyer_user_id) OR a guest reached via shareable link (buyer_email + token)
  buyer_user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,           -- null = guest
  buyer_org_id               uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  buyer_email                text,                                                        -- required for guests
  buyer_guest_token          text UNIQUE,                                                 -- opaque bearer secret; guest views/approves via this
  -- snapshots (locked at purchase; survive later package edits)
  price_snapshot             numeric(10,2) NOT NULL CHECK (price_snapshot >= 0),
  platform_fee_snapshot      numeric(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee_snapshot >= 0),
  turnaround_days_snapshot   int,
  scope_snapshot             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- escrow (mirrors campaigns.escrow_status)
  escrow_status              text NOT NULL DEFAULT 'pending'
                               CHECK (escrow_status IN ('pending','held','releasing','released','refunded')),
  escrow_payment_intent_id   text,
  escrow_checkout_session_id text,
  -- delivery / dual-approval (mirrors campaign_collaborations)
  order_status               text NOT NULL DEFAULT 'pending_payment'
                               CHECK (order_status IN ('pending_payment','in_progress','submitted','revision_requested','completed','cancelled','refunded','disputed')),
  content_status             text CHECK (content_status IN ('submitted','approved','auto_approved','rejected')),
  content_submitted_at       timestamptz,
  buyer_completion_status    text CHECK (buyer_completion_status IN ('requested','approved')),
  creator_completion_status  text CHECK (creator_completion_status IN ('requested','approved')),
  revision_count             int NOT NULL DEFAULT 0,
  -- durable payout marker (mirrors campaign_collaborations.payout_executed_at — credit-at-most-once)
  payout_executed_at         timestamptz,
  stripe_transfer_id         text,
  completed_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  -- a buyer principal must always be identifiable
  CONSTRAINT package_orders_buyer_present CHECK (buyer_user_id IS NOT NULL OR buyer_email IS NOT NULL)
);
CREATE INDEX idx_package_orders_creator   ON public.package_orders(creator_id, order_status);
CREATE INDEX idx_package_orders_buyer     ON public.package_orders(buyer_user_id) WHERE buyer_user_id IS NOT NULL;
CREATE INDEX idx_package_orders_package   ON public.package_orders(package_id);
CREATE INDEX idx_package_orders_reconcile ON public.package_orders(escrow_status, order_status);
-- At most ONE pending order per (package, buyer, org) — the atomic idempotency arbiter the create_package_order
-- RPC upserts against, so a concurrent/retried authenticated checkout can't spawn duplicate pending orders.
-- NULLS NOT DISTINCT (PG15+) so a buyer with no org still collapses to one; guests (buyer_user_id NULL) are
-- excluded by the partial predicate and always mint a fresh order.
CREATE UNIQUE INDEX idx_package_orders_one_pending_per_buyer
  ON public.package_orders (package_id, buyer_user_id, buyer_org_id) NULLS NOT DISTINCT
  WHERE order_status = 'pending_payment' AND buyer_user_id IS NOT NULL;

CREATE TABLE public.package_order_intake (
  order_id       uuid PRIMARY KEY REFERENCES public.package_orders(id) ON DELETE CASCADE,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- keyed to the package's intake_schema (incl. reference-reel URLs)
  schema_version int NOT NULL DEFAULT 1,
  -- promoted scalars the scheduling/notification paths filter on without JSON extraction
  shoot_date     date,
  address        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_package_orders_updated_at BEFORE UPDATE ON public.package_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.package_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_order_intake ENABLE ROW LEVEL SECURITY;

-- Authenticated participants (the creator being paid, or a logged-in buyer) may READ their orders. Guests
-- have no auth.uid(); they read their single order only through get_guest_order_by_token (SECURITY DEFINER,
-- token-scoped). ALL WRITES go through service-role edge functions / SECURITY DEFINER RPCs — there is
-- deliberately NO client write policy, so order creation and state transitions are entirely server-controlled.
CREATE POLICY "Order participants can view their package orders"
  ON public.package_orders FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid() OR buyer_user_id = auth.uid());

CREATE POLICY "Order participants can view intake"
  ON public.package_order_intake FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.package_orders po
      WHERE po.id = package_order_intake.order_id
        AND (po.creator_id = auth.uid() OR po.buyer_user_id = auth.uid())
    )
  );
