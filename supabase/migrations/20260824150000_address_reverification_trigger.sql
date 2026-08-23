-- A verified address stamp must never outlive the address it describes.
--
-- FINDING 1 (task-7 fix round 1, two-reviewer pass on the address-verification feature).
-- Task 4 already closed this exact hole for phone (clear_phone_verification, migration
-- 20260824120000): a DB trigger nulls phone_verified_at the instant phone changes,
-- independent of anything the client does. Address verification (this feature) shipped
-- with no equivalent — the only thing tying address_verified_at/lat/lng to the CURRENT
-- address was an un-awaited, fire-and-forget call to the verify-address edge function,
-- made AFTER the address write had already committed.
--
-- Concretely: a creator with a verified NYC address changes their city to Los Angeles
-- and saves. The city write commits immediately. The fire-and-forget verify-address
-- call fires but is not awaited — if the tab closes, the network drops, or (true today,
-- since GOOGLE_MAPS_SERVER_API_KEY is not yet provisioned) the function 503s, the
-- request never lands. The row is left with city='Los Angeles' and a stamp/coordinates
-- that still describe New York, indefinitely, with nothing to ever correct it.
--
-- Fix: mirror clear_phone_verification exactly, on both tables that carry
-- address_verified_at (creator_profiles, org_units — NOT business_profiles, which does
-- not carry these columns; see PROJECT_CONTEXT.md's note that a business's verified
-- address lives on org_units, one per location, and business_profiles is the account).
--
-- The address columns differ per table (read from schema, not assumed):
--   creator_profiles: city, country, postal_code  (the fields verify-address geocodes)
--   org_units:        address                      (a single free-text field)
--
-- CARRYING RULING 4's LESSON VERBATIM (from 20260824120000): use the DUAL condition,
-- not a bare "address changed -> clear". verify-address's own write to
-- lat/lng/address_verified_at never touches city/country/postal_code or address in the
-- same statement today, so this dual condition is not exercised by any call site yet —
-- but the whole point of Ruling 4 is that a FUTURE composite write (address fields +
-- stamp, in one statement) must survive rather than have this trigger null the stamp
-- it was just handed. The second clause is what makes that true: it fires only when
-- the stamp is NOT changing in the same statement.
--
-- IS DISTINCT FROM (not <>) throughout — NULL on either side must behave, exactly as
-- 20260824120000 documents.
--
-- Column-scoped triggers (BEFORE UPDATE OF <address columns>), matching
-- clear_phone_verification's shape — they fire only when an UPDATE statement's SET
-- list includes one of the named columns, which is also why no INSERT branch is
-- needed here: Task 3's guard triggers (20260824111000) already reject any non-
-- service-role INSERT that sets address_verified_at/lat/lng to a non-NULL value, so a
-- forged stamp can never enter on row creation in the first place. UPSERT/ON CONFLICT
-- DO UPDATE routes through the UPDATE branch (documented in DATABASE_SCHEMA.md's note
-- on the collaboration-state-machine restoration), so it is covered.
--
-- Not SECURITY DEFINER — these functions only assign to NEW, nothing privileged
-- happens inside them, so DEFINER would be an elevation with no benefit (same
-- reasoning as 20260824111000's drop and 20260824120000's drop). Plain invoker
-- default, search_path pinned.

create or replace function public.clear_creator_address_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.city is distinct from old.city
      or new.country is distinct from old.country
      or new.postal_code is distinct from old.postal_code)
     and new.address_verified_at is not distinct from old.address_verified_at
  then
    new.address_verified_at := null;
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_clear_creator_address_verification on public.creator_profiles;
create trigger trg_clear_creator_address_verification
  before update of city, country, postal_code on public.creator_profiles
  for each row
  execute function public.clear_creator_address_verification();

create or replace function public.clear_org_unit_address_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.address is distinct from old.address
     and new.address_verified_at is not distinct from old.address_verified_at
  then
    new.address_verified_at := null;
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_clear_org_unit_address_verification on public.org_units;
create trigger trg_clear_org_unit_address_verification
  before update of address on public.org_units
  for each row
  execute function public.clear_org_unit_address_verification();

-- Finding 4 from the review (org_units address cleared to empty leaves stale
-- coordinates behind) is closed by this trigger too, with no separate migration:
-- new.address is distinct from old.address covers a change TO an empty/NULL address
-- exactly the same as a change to a different one, so lat/lng/address_verified_at are
-- nulled in that case as well.
