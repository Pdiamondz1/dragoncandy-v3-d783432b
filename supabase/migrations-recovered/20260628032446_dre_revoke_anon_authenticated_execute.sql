-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260628032446 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Supabase grants EXECUTE to anon/authenticated by DEFAULT PRIVILEGES, so the
-- migration's `revoke … from public` was insufficient — these SECURITY DEFINER
-- RPCs return cross-user data and must be service_role-only. Caught by the live
-- security advisor after applying the schema migration.
revoke execute on function public.dre_pending_events() from anon, authenticated;
revoke execute on function public.dre_user_aggregates(uuid[]) from anon, authenticated;
