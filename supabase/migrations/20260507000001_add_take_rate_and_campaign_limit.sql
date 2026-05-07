-- Add take_rate and active_campaign_limit to organizations.
-- Supports the v2 pricing take-rate ladder (10%/7%/5%/3%/2%)
-- and per-tier campaign count enforcement.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS take_rate numeric(4,4) NOT NULL DEFAULT 0.10;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS active_campaign_limit integer NOT NULL DEFAULT 1;

-- Backfill existing orgs based on current subscription_tier
UPDATE public.organizations SET take_rate = 0.10, active_campaign_limit = 1
  WHERE subscription_tier = 'free';
UPDATE public.organizations SET take_rate = 0.07, active_campaign_limit = 3
  WHERE subscription_tier = 'starter';
UPDATE public.organizations SET take_rate = 0.05, active_campaign_limit = 10
  WHERE subscription_tier = 'growth';
UPDATE public.organizations SET take_rate = 0.03, active_campaign_limit = 2147483647
  WHERE subscription_tier = 'pro';
UPDATE public.organizations SET take_rate = 0.02, active_campaign_limit = 2147483647
  WHERE subscription_tier = 'enterprise';

COMMENT ON COLUMN public.organizations.take_rate IS
  'Platform take rate applied to campaign payments. Decreases with higher tiers: Free 10%, Starter 7%, Growth 5%, Pro 3%, Enterprise 2%.';

COMMENT ON COLUMN public.organizations.active_campaign_limit IS
  'Max concurrent active campaigns for this org. Free=1, Starter=3, Growth=10, Pro/Enterprise=unlimited.';
