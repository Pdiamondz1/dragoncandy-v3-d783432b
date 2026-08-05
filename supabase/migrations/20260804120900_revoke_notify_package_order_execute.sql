-- v1e hardening: notify_package_order() is a TRIGGER function — it must never be callable as a PostgREST RPC.
-- On creation it received the default PUBLIC EXECUTE grant, which the anon/authenticated_security_definer_
-- function_executable advisors flag. PostgREST does not expose trigger-returning functions as /rpc endpoints,
-- and an AFTER UPDATE trigger fires independently of the caller's EXECUTE privilege — so revoking EXECUTE here
-- is safe (the trigger keeps firing) and closes the advisor. Depends on 20260804120800.
REVOKE EXECUTE ON FUNCTION public.notify_package_order() FROM PUBLIC, anon, authenticated;
