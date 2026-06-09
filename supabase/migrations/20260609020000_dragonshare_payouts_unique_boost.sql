-- Fix: prevent duplicate DragonShare payout rows for a single boost.
--
-- fulfill-boost.ts does a check-then-act on dragonshare_boosts.status before inserting a
-- payout, so two racing fulfillments (e.g. a webhook retry overlapping the in-flight call)
-- could each insert a dragonshare_payouts row. The Stripe transfer itself is idempotent
-- (idempotencyKey boost_tr_<boostId>) so no double money moves — but the payout ledger
-- could show duplicates. A UNIQUE(boost_id) makes the second insert fail (23505), which
-- fulfill-boost now treats as a benign no-op.
--
-- Verified 0 existing duplicate boost_id rows before adding the constraint.

ALTER TABLE public.dragonshare_payouts
  ADD CONSTRAINT dragonshare_payouts_boost_id_key UNIQUE (boost_id);
