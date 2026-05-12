-- Per-location Stripe Connect support
ALTER TABLE public.org_units
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_balance NUMERIC DEFAULT 0;
