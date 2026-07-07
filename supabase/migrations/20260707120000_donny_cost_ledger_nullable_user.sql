-- AIOS spend source-of-truth (Slice A): let platform/system AI calls log their cost.
--
-- The ≤15%-of-revenue AI cap needs `donny_cost_ledger` to be a COMPLETE record of
-- runtime AI spend. But `user_id` was NOT NULL with a FK to auth.users, so any
-- user-less runtime call (the cron RAG-embedding sync, the anonymous landing-brief
-- generator) inserted either a placeholder/absent user_id and failed the FK/NOT NULL
-- — the row was silently dropped by the best-effort cost-logging catch. Result: 0
-- embedding rows ever landed, and platform spend read ~50x too low.
--
-- Non-destructive: only drops NOT NULL. The FK to auth.users stays (NULL is allowed
-- by a foreign key), so real-user rows are unchanged; system/anonymous calls now log
-- with user_id = NULL. The cost-ledger helper coerces the all-zeros placeholder and
-- empty strings to NULL so those inserts succeed.
alter table public.donny_cost_ledger
  alter column user_id drop not null;
