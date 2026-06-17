-- Donny gated corrections: Internal Donny PROPOSES, a founder APPROVES, the
-- system APPLIES. Rows are written ONLY by the service-role aios-report-ingest
-- choke point (Donny never writes directly); admins approve from
-- /internal/corrections. Admin-only in both directions — proposals can quote
-- internal data, same as aios_findings.

-- Correctable dashboard values (kept OUT of the service-role-only aios_settings,
-- which holds a near-secret). Internal users read; admins write; seeded here.
create table if not exists public.aios_dashboard_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.aios_dashboard_settings enable row level security;

drop policy if exists "aios_dashboard_settings_internal_select" on public.aios_dashboard_settings;
create policy "aios_dashboard_settings_internal_select" on public.aios_dashboard_settings
  for select to authenticated
  using (public.is_internal_user());

drop policy if exists "aios_dashboard_settings_admin_update" on public.aios_dashboard_settings;
create policy "aios_dashboard_settings_admin_update" on public.aios_dashboard_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
-- No INSERT/DELETE policies: keys are seeded by migration, mutated only by the
-- admin-gated apply RPC (SECURITY DEFINER) or this migration.

insert into public.aios_dashboard_settings (key, value)
values ('current_compute_tier_index', '0'::jsonb)
on conflict (key) do nothing;

-- The proposal queue.
create table if not exists public.aios_corrections (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('dashboard_setting','strategy_doc')),
  target_ref text not null,
  title text not null,
  rationale_md text not null,
  current_value jsonb not null,
  proposed_value jsonb not null,
  status text not null
    check (status in ('proposed','approved','rejected','applied','superseded'))
    default 'proposed',
  proposed_by text not null default 'donny',
  proposed_by_user uuid references auth.users (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aios_corrections_status
  on public.aios_corrections (status, created_at desc);

alter table public.aios_corrections enable row level security;

-- Admin-only both directions (proposals can reference internals — mirrors aios_findings).
drop policy if exists "aios_corrections_admin_select" on public.aios_corrections;
create policy "aios_corrections_admin_select" on public.aios_corrections
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
-- No authenticated UPDATE/INSERT/DELETE: rows arrive via the service-role ingest
-- function; the ONLY mutation path for app users is the apply RPC below.

create trigger trg_aios_corrections_updated_at
  before update on public.aios_corrections
  for each row execute function handle_updated_at();
create trigger trg_aios_dashboard_settings_updated_at
  before update on public.aios_dashboard_settings
  for each row execute function handle_updated_at();

-- Apply / reject a proposal. Admin-only (enforced in-body since SECURITY DEFINER
-- bypasses RLS). Re-validates current state (optimistic concurrency) and applies
-- the change for the caller. Returns a jsonb result the UI renders.
create or replace function public.aios_corrections_apply(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.aios_corrections;
  live_value jsonb;
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject';
  end if;

  select * into c from public.aios_corrections where id = p_id for update;
  if not found then
    raise exception 'correction not found';
  end if;
  if c.status <> 'proposed' then
    return jsonb_build_object('status', c.status, 'message', 'already decided');
  end if;

  if p_decision = 'reject' then
    update public.aios_corrections
      set status = 'rejected', reviewed_by = uid, reviewed_at = now()
      where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- approve: re-read live value, supersede on drift.
  if c.target_type = 'dashboard_setting' then
    select value into live_value from public.aios_dashboard_settings where key = c.target_ref;
    if live_value is distinct from c.current_value then
      update public.aios_corrections
        set status = 'superseded', reviewed_by = uid, reviewed_at = now() where id = p_id;
      return jsonb_build_object('status', 'superseded', 'message', 'value changed since proposal; re-propose');
    end if;
    update public.aios_dashboard_settings
      set value = c.proposed_value, updated_at = now(), updated_by = uid
      where key = c.target_ref;
    update public.aios_corrections
      set status = 'applied', reviewed_by = uid, reviewed_at = now(), applied_at = now()
      where id = p_id;
    return jsonb_build_object('status', 'applied', 'target_type', 'dashboard_setting');

  elsif c.target_type = 'strategy_doc' then
    -- Compare on normalized text so a benign no-op sync rewrite doesn't false-supersede.
    select to_jsonb(content_md) into live_value from public.internal_docs where path = c.target_ref;
    if btrim(coalesce(live_value #>> '{}', '')) is distinct from btrim(coalesce(c.current_value #>> '{}', '')) then
      update public.aios_corrections
        set status = 'superseded', reviewed_by = uid, reviewed_at = now() where id = p_id;
      return jsonb_build_object('status', 'superseded', 'message', 'doc changed since proposal; re-propose');
    end if;
    update public.internal_docs
      set content_md = c.proposed_value #>> '{}', updated_at = now()
      where path = c.target_ref;
    update public.aios_corrections
      set status = 'applied', reviewed_by = uid, reviewed_at = now(), applied_at = now()
      where id = p_id;
    return jsonb_build_object(
      'status', 'applied', 'target_type', 'strategy_doc',
      'wiki_path', c.target_ref, 'corrected_md', c.proposed_value #>> '{}'
    );
  end if;

  raise exception 'unknown target_type %', c.target_type;
end;
$$;

revoke all on function public.aios_corrections_apply(uuid, text) from public, anon;
grant execute on function public.aios_corrections_apply(uuid, text) to authenticated;
