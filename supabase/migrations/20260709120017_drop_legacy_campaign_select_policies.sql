-- Defense-in-depth (Codex round 5): assert that no legacy PERMISSIVE campaigns SELECT
-- policy survives to OR-in alongside "Users can view accessible campaigns". RLS permissive
-- policies are OR'd, so a leftover "published => anyone" policy would defeat group-campaign
-- privacy. All three historical names were already dropped by their successor migrations
-- (verified: prod currently has exactly one campaigns SELECT policy), so these are no-ops
-- on prod — but they make the visibility invariant explicit and replay-safe in every env.
DROP POLICY IF EXISTS "Users can view published campaigns or their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can only view their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can view own campaigns or published campaigns" ON public.campaigns;
