-- Donny web access: allow the web-tool tiers on the cost ledger, and index the
-- (user, tier, day) count used to enforce daily web-search caps.
-- Non-destructive: only WIDENS the existing tier CHECK (drop + re-add is the
-- Postgres idiom), mirroring 20260707120100_donny_cost_ledger_tier_embedding.sql.

alter table public.donny_cost_ledger
  drop constraint if exists donny_cost_ledger_tier_check;

alter table public.donny_cost_ledger
  add constraint donny_cost_ledger_tier_check
  check (tier = any (array['T0', 'T1', 'T2', 'T3', 'embedding', 'web_search', 'web_extract']));

create index if not exists idx_dcl_user_tier_created
  on public.donny_cost_ledger (user_id, tier, created_at);
