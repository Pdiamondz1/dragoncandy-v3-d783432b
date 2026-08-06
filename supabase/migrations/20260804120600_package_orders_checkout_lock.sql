-- Single-flight checkout lock for package orders. create-package-order-escrow atomically claims this column
-- (a conditional UPDATE that only one concurrent request can win) BEFORE minting a Stripe Checkout Session, so
-- two near-simultaneous checkouts for the same pending order can't both mint a payable session (which would
-- risk a double charge if the buyer paid both tabs). The claim has a short TTL (the function treats a stale
-- lock as free) so a crash mid-mint can't wedge checkout permanently. Depends on 20260804120100.

ALTER TABLE public.package_orders ADD COLUMN checkout_locked_at timestamptz;
