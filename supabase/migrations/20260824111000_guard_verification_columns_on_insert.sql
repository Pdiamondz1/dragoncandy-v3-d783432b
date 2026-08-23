-- Fix round 1 on 20260824110000: the verification-column guard was BEFORE UPDATE only.
--
-- Proven live on prod (rolled back): as the legitimate owner of a creator_profiles row,
-- deleting the row in-transaction and re-inserting it with identity_verified_at = now(),
-- tax_id_provided = true succeeded and returned the forged values — none of the three
-- tables' INSERT RLS policies constrain which columns may be set. Not reachable through
-- the app UI (every insert path in src/ passes a literal object that never sets these
-- fields), but any authenticated user can call the Supabase REST API directly with the
-- anon key + their own JWT and forge "verified" on first profile/unit creation, before
-- Stripe has said anything.
--
-- Fix: extend each guard to BEFORE INSERT OR UPDATE, branching on TG_OP. OLD is unbound
-- on INSERT (referencing it raises at runtime), so the INSERT branch cannot reuse the
-- UPDATE's NEW/OLD comparison — instead it rejects any INSERT where the caller is not
-- service_role AND any guarded column on that table is non-NULL. A legitimate client
-- insert never sets them, so a NULL check is the correct bar and needs no OLD. The
-- UPDATE branch is unchanged from 20260824110000 — independently verified correct.
--
-- Also: these functions only read a session GUC and compare NEW/OLD values — nothing
-- privileged happens inside them — so SECURITY DEFINER was an elevation with no benefit.
-- Dropped in favor of the plain-invoker default (Postgres default when the clause is
-- omitted), keeping search_path pinned.
--
-- This is a NEW migration, not an edit to 20260824110000 — that migration is applied to
-- prod with its ledger row in place, and editing applied migrations is how this repo's
-- ledger drifted to 234 divergent files in the first place.

create or replace function public.guard_creator_profiles_verification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    if TG_OP = 'INSERT' then
      if new.identity_verified_at is not null
        or new.tax_id_provided is not null
        or new.stripe_requirements_due is not null
        or new.stripe_disabled_reason is not null
        or new.address_verified_at is not null
      then
        raise exception 'verification columns are server-write-only';
      end if;
    elsif TG_OP = 'UPDATE' then
      if new.identity_verified_at    is distinct from old.identity_verified_at
        or new.tax_id_provided         is distinct from old.tax_id_provided
        or new.stripe_requirements_due is distinct from old.stripe_requirements_due
        or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason
        or new.address_verified_at     is distinct from old.address_verified_at
      then
        raise exception 'verification columns are server-write-only';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_creator_profiles_verification_columns on public.creator_profiles;
create trigger guard_creator_profiles_verification_columns
  before insert or update on public.creator_profiles
  for each row execute function public.guard_creator_profiles_verification_columns();

create or replace function public.guard_business_profiles_verification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    if TG_OP = 'INSERT' then
      if new.identity_verified_at is not null
        or new.tax_id_provided is not null
        or new.stripe_requirements_due is not null
        or new.stripe_disabled_reason is not null
      then
        raise exception 'verification columns are server-write-only';
      end if;
    elsif TG_OP = 'UPDATE' then
      if new.identity_verified_at    is distinct from old.identity_verified_at
        or new.tax_id_provided         is distinct from old.tax_id_provided
        or new.stripe_requirements_due is distinct from old.stripe_requirements_due
        or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason
      then
        raise exception 'verification columns are server-write-only';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_business_profiles_verification_columns on public.business_profiles;
create trigger guard_business_profiles_verification_columns
  before insert or update on public.business_profiles
  for each row execute function public.guard_business_profiles_verification_columns();

create or replace function public.guard_org_units_verification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    if TG_OP = 'INSERT' then
      if new.identity_verified_at is not null
        or new.tax_id_provided is not null
        or new.stripe_requirements_due is not null
        or new.stripe_disabled_reason is not null
        or new.address_verified_at is not null
      then
        raise exception 'verification columns are server-write-only';
      end if;
    elsif TG_OP = 'UPDATE' then
      if new.identity_verified_at    is distinct from old.identity_verified_at
        or new.tax_id_provided         is distinct from old.tax_id_provided
        or new.stripe_requirements_due is distinct from old.stripe_requirements_due
        or new.stripe_disabled_reason  is distinct from old.stripe_disabled_reason
        or new.address_verified_at     is distinct from old.address_verified_at
      then
        raise exception 'verification columns are server-write-only';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_org_units_verification_columns on public.org_units;
create trigger guard_org_units_verification_columns
  before insert or update on public.org_units
  for each row execute function public.guard_org_units_verification_columns();
