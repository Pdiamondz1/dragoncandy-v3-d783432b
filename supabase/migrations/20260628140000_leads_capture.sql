-- Lead capture from the public marketing / landing page.
--
-- Visitors who do NOT want to register can leave their contact info / a message;
-- the row is PRIVATE (internal-team read only) and a Resend notification fires per
-- lead from the `capture-lead` edge function.
--
-- Submission path: the `capture-lead` edge function validates the payload and
-- INSERTs with the service-role key (which has BYPASSRLS) — so there is deliberately
-- NO anon INSERT policy here (unlike analytics_events). This keeps the public DML
-- surface fully closed on a table that holds contact PII: anon and ordinary
-- authenticated users can neither read, insert, update, nor delete.

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  company     text,                                  -- business / brand name (optional)
  audience    text not null default 'other'
              check (audience in ('business','brand','creator','other')),
  message     text,
  source      text,                                  -- e.g. 'landing_page' or page path
  status      text not null default 'new'
              check (status in ('new','contacted','qualified','converted','spam','archived')),
  user_id     uuid references auth.users(id) on delete set null,  -- null for anon; attribution only
  metadata    jsonb not null default '{}'::jsonb,    -- user_agent, utm, etc.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.leads enable row level security;

-- READ: internal team only (admin + stakeholder via the locked-down
-- public.is_internal_user() security-definer helper). No anon / ordinary
-- authenticated SELECT.
drop policy if exists "Internal users can read leads" on public.leads;
create policy "Internal users can read leads"
  on public.leads
  for select
  to authenticated
  using (public.is_internal_user());

-- UPDATE: internal team only — triage status changes from the future /internal surface.
drop policy if exists "Internal users can update leads" on public.leads;
create policy "Internal users can update leads"
  on public.leads
  for update
  to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

-- NOTE: no INSERT / DELETE policy by design. The capture-lead edge function inserts
-- with the service-role key (bypasses RLS); everyone else is denied.

create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_status     on public.leads (status);
create index if not exists idx_leads_email       on public.leads (email);

-- updated_at maintenance. Self-contained trigger fn (not SECURITY DEFINER, fixed
-- search_path) so it carries no anon-execute footgun and no mutable-search_path advisor.
create or replace function public.handle_leads_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.handle_leads_updated_at();
