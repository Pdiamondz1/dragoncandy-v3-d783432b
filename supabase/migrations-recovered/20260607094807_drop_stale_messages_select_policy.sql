-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260607094807 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Prod drift remediation: the repo migration 20260506200000_security_messages_rls.sql
-- dropped this legacy policy and replaced it with "messages: select by participant",
-- but that migration never reached prod. Two permissive SELECT policies OR together,
-- so this legacy policy (no block filter) would defeat the UGC block. Drop it so the
-- block-aware "messages: select by participant" policy is the only SELECT policy.
DROP POLICY IF EXISTS "Users can view messages they sent or received" ON public.messages;
