-- AIOS spend source-of-truth (Slice A, cont.): allow the 'embedding' tier.
--
-- The other reason 0 embedding rows ever landed (alongside the user_id FK): the
-- tier CHECK only allowed T0–T3, but logEmbeddingCost() inserts tier='embedding',
-- so every embedding row also failed this constraint. Widen the allow-set.
--
-- Non-destructive: only WIDENS the CHECK (drop + re-add is the Postgres idiom for
-- altering a check; no rows are lost — the new set is a superset of the old).
alter table public.donny_cost_ledger
  drop constraint if exists donny_cost_ledger_tier_check;
alter table public.donny_cost_ledger
  add constraint donny_cost_ledger_tier_check
  check (tier = any (array['T0', 'T1', 'T2', 'T3', 'embedding']));
