-- Provider discriminator for the SocialProvider seam. Existing rows are Outstand.
-- Reuses business_outstand_accounts (no rename, per the never-rename rule); the
-- outstand_social_account_id column is treated as an opaque provider-agnostic id.
ALTER TABLE public.business_outstand_accounts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'outstand';

COMMENT ON COLUMN public.business_outstand_accounts.provider IS
  'Social provider for this connection: outstand | zernio. Default outstand for legacy rows.';
