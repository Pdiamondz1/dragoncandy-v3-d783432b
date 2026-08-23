-- Identity, tax and address signals for the account completeness engine (slice 2).
--
-- NO TAX ID NUMBER IS EVER STORED. Both Connect accounts are Express, so Stripe collects
-- and verifies the tax ID and never exposes it to the platform. We mirror the SIGNAL.
--
-- All nullable, no default, no backfill. NULL means "we have not heard from Stripe about
-- this account yet", which is genuinely different from "not verified" — and the engine
-- already renders that difference, because an absent fact derives `unknown`.
--
-- PROTECTION MECHANISM — deliberately NOT the Task 2 (profiles) pattern.
-- Task 2 revoked table-wide UPDATE on `profiles` and granted back an explicit column list,
-- which is safe there because every client write to `profiles` passes a literal object
-- (grep-enumerable). That does not hold for these three tables:
--   - useCreatorProfileSubmit.ts:98  .update(profileData)  — profileData built at runtime
--   - useBusinessProfileSubmit.ts:103 .update(profileData) — same shape
--   - useOrgData.ts:268  .update({ ...updates, updated_at })  where `updates` is a
--     caller-supplied partial (useUpdateOrgUnit({ id, ...updates })) — its column set is
--     whatever any call site passes, not enumerable by grep
--   - useOrgData.ts:235 .insert(payload)
-- An explicit grant list against a write surface that cannot be enumerated is a trap: any
-- call site passing an unlisted column gets an unpredicted 42501 in production, which is
-- exactly what happened to `profiles.dismissed_coachmarks` on the *easy* table.
--
-- Instead: each table KEEPS its existing table-wide UPDATE grant untouched, and a
-- BEFORE UPDATE trigger rejects only an attempted change to the verification columns
-- specifically, unless the caller is service_role. Every other column write passes through
-- exactly as it does today.

alter table public.creator_profiles
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text,
  add column if not exists address_verified_at timestamptz,
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.business_profiles
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text;

alter table public.org_units
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text,
  add column if not exists address_verified_at timestamptz;

comment on column public.creator_profiles.lat is
  'City/postal CENTROID, never a street address. Enough for distance matching, not enough to locate a home.';
comment on column public.creator_profiles.identity_verified_at is
  'Stripe reported verification=verified. NULL = not yet heard from Stripe. Server-write-only.';
comment on column public.creator_profiles.tax_id_provided is
  'Stripe holds a tax ID. NEVER the number itself.';

-- ---------------------------------------------------------------------------------------
-- Server-write-only guard on the verification columns (per-table BEFORE UPDATE trigger).
--
-- `current_setting('request.jwt.claims', true)` returns NULL rather than raising when the
-- setting is absent (a direct psql/service connection outside PostgREST), so the `true`
-- second argument is required.
--
-- `IS DISTINCT FROM` is required, not `<>` — with `<>`, comparing a NULL role setting
-- against 'service_role' yields NULL, and `IF NULL THEN` does not fire in plpgsql, so the
-- guard would silently fail OPEN for any caller with no role claim. `IS DISTINCT FROM`
-- treats NULL as a distinct value, so a missing/foreign role correctly reads as "not
-- service_role" and the guard fails CLOSED. The same reasoning applies to comparing
-- NEW/OLD column values: every one of these columns starts NULL, so `<>` would silently
-- never fire on the very first legitimate server write.
--
-- Mirrors the established `request.jwt.claims->>'role' = 'service_role'` pattern already
-- used by credit_pending_balance_for_payout and the pending_balance_flushes RPCs.
-- ---------------------------------------------------------------------------------------

create or replace function public.guard_creator_profiles_verification_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role'
     and (new.identity_verified_at    is distinct from old.identity_verified_at
       or new.tax_id_provided         is distinct from old.tax_id_provided
       or new.stripe_requirements_due is distinct from old.stripe_requirements_due
       or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason
       or new.address_verified_at     is distinct from old.address_verified_at)
  then
    raise exception 'verification columns are server-write-only';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_creator_profiles_verification_columns on public.creator_profiles;
create trigger guard_creator_profiles_verification_columns
  before update on public.creator_profiles
  for each row execute function public.guard_creator_profiles_verification_columns();

create or replace function public.guard_business_profiles_verification_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role'
     and (new.identity_verified_at    is distinct from old.identity_verified_at
       or new.tax_id_provided         is distinct from old.tax_id_provided
       or new.stripe_requirements_due is distinct from old.stripe_requirements_due
       or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason)
  then
    raise exception 'verification columns are server-write-only';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_business_profiles_verification_columns on public.business_profiles;
create trigger guard_business_profiles_verification_columns
  before update on public.business_profiles
  for each row execute function public.guard_business_profiles_verification_columns();

create or replace function public.guard_org_units_verification_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role'
     and (new.identity_verified_at    is distinct from old.identity_verified_at
       or new.tax_id_provided         is distinct from old.tax_id_provided
       or new.stripe_requirements_due is distinct from old.stripe_requirements_due
       or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason
       or new.address_verified_at     is distinct from old.address_verified_at)
  then
    raise exception 'verification columns are server-write-only';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_org_units_verification_columns on public.org_units;
create trigger guard_org_units_verification_columns
  before update on public.org_units
  for each row execute function public.guard_org_units_verification_columns();

-- Note: lat/lng are deliberately NOT guarded on either table. org_units.lat/lng are
-- already client-writable today through useUpdateOrgUnit's caller-supplied partial;
-- creator_profiles.lat/lng are new columns of the same shape. Either way, the
-- address-verification requirement keys off address_verified_at alone, so a forged
-- coordinate proves nothing — guarding them would (for org_units) break an existing
-- path, and (for creator_profiles) add protection with no security gain.
