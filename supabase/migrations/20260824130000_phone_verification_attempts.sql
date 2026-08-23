-- Per-user and per-IP send throttling for phone verification.
--
-- SMS pumping is the actual threat: an attacker triggers large volumes of OTPs to
-- premium-rate numbers they control and collects a share of the carrier fee, which we
-- pay. Per-user alone is defeated by creating accounts, so both dimensions are recorded.

create table if not exists public.phone_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text,
  action text not null check (action in ('start', 'check')),
  outcome text not null check (outcome in ('sent', 'approved', 'rejected', 'throttled', 'blocked_country')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pva_user_created on public.phone_verification_attempts (user_id, created_at desc);
create index if not exists idx_pva_ip_created on public.phone_verification_attempts (ip_hash, created_at desc);

-- No client access at all: written and read only by the service role.
alter table public.phone_verification_attempts enable row level security;
revoke all on public.phone_verification_attempts from public, anon, authenticated;
grant all on public.phone_verification_attempts to service_role;
create policy pva_service_all on public.phone_verification_attempts
  for all to service_role using (true) with check (true);
