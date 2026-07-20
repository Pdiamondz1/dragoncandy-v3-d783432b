-- Remove the obsolete 6-argument apply_to_campaign overload.
--
-- Two overloads existed on the database:
--   * apply_to_campaign(uuid,uuid,numeric,text,text,boolean)          -- original (20260521000002)
--   * apply_to_campaign(uuid,uuid,numeric,text,text,boolean,text)     -- superset adding
--                                                                        p_portfolio_url
--                                                                        (20260525000001) + the
--                                                                        crew group guard
--                                                                        (20260709120012/15)
--
-- PostgREST resolves RPC calls by ARGUMENT NAME. A call that omits p_portfolio_url
-- (a 6-key body) matches BOTH overloads, so PostgREST cannot choose and returns
-- PGRST203 "Could not choose the best candidate function". That error message
-- contains neither "row-level security" nor "violates row", so the app's apply
-- handler falls through to the generic "Failed to submit application. Please try
-- again later." toast — with no row inserted. (Verified against prod: a 6-key
-- POST to /rest/v1/rpc/apply_to_campaign returns PGRST203; a 7-key POST resolves
-- and runs.)
--
-- Dropping the obsolete 6-arg overload removes the ambiguity. Every call now
-- resolves to the single 7-arg function; a 6-key caller simply gets
-- p_portfolio_url = NULL via its DEFAULT. Both 6-key and 7-key callers succeed.
--
-- Safe: the 7-arg function is a strict superset of the 6-arg behaviour, no data
-- is touched, and it is reversible (recreate the 6-arg signature to undo).
-- No CASCADE: if anything unexpectedly depends on this overload, the DROP fails
-- loudly rather than silently removing dependents.

DROP FUNCTION IF EXISTS public.apply_to_campaign(
  uuid, uuid, numeric, text, text, boolean
);
