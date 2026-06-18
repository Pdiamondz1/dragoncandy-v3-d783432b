-- Wiki-commit PR tracking for applied strategy-doc corrections. Additive only.
-- Written exclusively by the service-role wiki-commit-pr edge function; no RLS
-- change (aios_corrections stays admin-only SELECT, no authenticated writes).
alter table public.aios_corrections
  add column if not exists wiki_pr_url text,
  add column if not exists wiki_pr_number integer,
  add column if not exists wiki_committed_at timestamptz;
