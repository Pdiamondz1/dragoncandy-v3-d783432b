-- AIOS Founder Playbooks v1 — saved, founder-authored repeatable internal tasks.
-- A playbook is a documented task (task + preferences + done-criteria + which
-- proposals it may make). A RUN executes it report-only + propose: it produces a
-- report and may propose corrections, but every write still routes through the
-- existing aios-report-ingest -> /internal/corrections approval gate. Nothing a
-- playbook does auto-applies. Admin-only in both directions, like aios_corrections.

-- The saved definitions. Founders author/edit these directly in the UI (unlike
-- aios_corrections, which arrive only via the service-role ingest), so admins get
-- full CRUD via RLS.
create table if not exists public.aios_playbooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  task_md text not null,
  preferences_md text not null default '',
  done_criteria_md text not null default '',
  -- Only 'dashboard_setting' / 'strategy_doc' are valid (the aios_corrections
  -- target_type enum). Empty array => report-only. Validated so an authoring typo
  -- can't silently disable proposals.
  -- `<@` = every element of allowed_proposals is contained in the allowed set
  -- (no subquery, so it is valid inside a CHECK).
  allowed_proposals jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(allowed_proposals) = 'array'
      and allowed_proposals <@ '["dashboard_setting","strategy_doc"]'::jsonb
    ),
  status text not null default 'active' check (status in ('active', 'archived')),
  source_finding_id uuid references public.aios_findings (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aios_playbooks enable row level security;

-- Admin-only CRUD: founders read, author, edit, archive their playbooks.
drop policy if exists "aios_playbooks_admin_select" on public.aios_playbooks;
create policy "aios_playbooks_admin_select" on public.aios_playbooks
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "aios_playbooks_admin_insert" on public.aios_playbooks;
create policy "aios_playbooks_admin_insert" on public.aios_playbooks
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "aios_playbooks_admin_update" on public.aios_playbooks;
create policy "aios_playbooks_admin_update" on public.aios_playbooks
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "aios_playbooks_admin_delete" on public.aios_playbooks;
create policy "aios_playbooks_admin_delete" on public.aios_playbooks
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- One run per execution. Written ONLY by the service-role runner
-- (aios-playbook-run); admins read. No authenticated write policies — the runner
-- bypasses RLS via the service role; app users never insert/update runs directly.
create table if not exists public.aios_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.aios_playbooks (id) on delete cascade,
  triggered_by uuid references auth.users (id),
  trigger text not null default 'manual' check (trigger in ('manual', 'donny')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  result_summary_md text,
  -- { done: bool, checklist: [{criterion, met}], missing: [] }; null = the run
  -- emitted no parseable self-assessment (UI shows a neutral chip).
  done_check jsonb,
  -- ids of corrections this run successfully proposed (link to /internal/corrections).
  correction_ids jsonb not null default '[]'::jsonb,
  error_md text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_aios_playbook_runs_playbook
  on public.aios_playbook_runs (playbook_id, started_at desc);

-- Concurrency guard: at most one in-flight run per playbook. The runner reaps any
-- stale 'running' row (started_at older than 5 min) to 'failed' before inserting,
-- so a hard-killed run can't lock the playbook permanently.
create unique index if not exists uq_aios_playbook_runs_one_running
  on public.aios_playbook_runs (playbook_id)
  where status = 'running';

alter table public.aios_playbook_runs enable row level security;

drop policy if exists "aios_playbook_runs_admin_select" on public.aios_playbook_runs;
create policy "aios_playbook_runs_admin_select" on public.aios_playbook_runs
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop trigger if exists trg_aios_playbooks_updated_at on public.aios_playbooks;
create trigger trg_aios_playbooks_updated_at
  before update on public.aios_playbooks
  for each row execute function public.handle_updated_at();
