-- Forward migration: add the 'refunding' escrow state to package_orders.
-- This is a durable "refund claimed, Stripe pending" marker: refund-package-order atomically CASes an order
-- from 'held' → 'refunding' BEFORE issuing the Stripe refund. The release-package-payout gate accepts only
-- 'held'/'releasing', so once an order is 'refunding' it can never be paid out — closing the refund-vs-payout
-- double-spend even if the Stripe call or the finalize step fails partway. Kept as a separate ALTER (not an
-- edit to 20260804120100) so that migration stays immutable for any database that already applied it.
-- The inline column CHECK in 20260804120100 is auto-named package_orders_escrow_status_check (Postgres's
-- <table>_<column>_check convention). Depends on 20260804120100_package_orders_tables.sql.

ALTER TABLE public.package_orders DROP CONSTRAINT package_orders_escrow_status_check;
ALTER TABLE public.package_orders ADD CONSTRAINT package_orders_escrow_status_check
  CHECK (escrow_status IN ('pending','held','releasing','released','refunded','refunding'));
