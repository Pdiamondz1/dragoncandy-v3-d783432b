-- Allow authenticated users to read social connection status and cached
-- analytics for ANY user. This powers the VerifiedBadge (checks if a creator
-- has active connected accounts) and VerifiedSocialStats (shows follower
-- counts on public profiles).
--
-- Only SELECT is opened — INSERT/UPDATE/DELETE remain restricted to the
-- row owner via existing policies.

-- business_outstand_accounts: let any authenticated user see connection status
CREATE POLICY "authenticated_read_outstand_accounts"
  ON public.business_outstand_accounts
  FOR SELECT
  TO authenticated
  USING (true);

-- social_analytics_cache: let any authenticated user read cached metrics
CREATE POLICY "authenticated_read_analytics_cache"
  ON public.social_analytics_cache
  FOR SELECT
  TO authenticated
  USING (true);
