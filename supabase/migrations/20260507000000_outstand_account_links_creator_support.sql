-- Allow creators (no business_profiles row) to also store connected social
-- accounts. business_id stays for restaurants but is now optional; user_id
-- becomes the canonical tenant key.

ALTER TABLE public.business_outstand_accounts
  ALTER COLUMN business_id DROP NOT NULL;

-- The previous unique constraint was on (business_id, outstand_social_account_id)
-- which doesn't catch duplicates when business_id is NULL (creators). Switch
-- to (user_id, outstand_social_account_id) — the new tenant key.
ALTER TABLE public.business_outstand_accounts
  DROP CONSTRAINT IF EXISTS unique_business_outstand_account;

ALTER TABLE public.business_outstand_accounts
  ADD CONSTRAINT unique_user_outstand_account
  UNIQUE (user_id, outstand_social_account_id);
