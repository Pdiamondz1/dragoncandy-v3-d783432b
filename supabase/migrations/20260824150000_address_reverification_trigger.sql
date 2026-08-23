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
-- service-role INSERT that sets address_verified_at to a non-NULL value, so a forged
-- STAMP can never enter on row creation. CORRECTED (task-7 fix round 2, Finding C):
-- an earlier version of this comment claimed the guard also covers lat/lng on INSERT.
-- It does not — read the live guard body (guard_creator_profiles_verification_columns /
-- guard_org_units_verification_columns, 20260824111000) directly: it checks
-- identity_verified_at, tax_id_provided, stripe_requirements_due,
-- stripe_disabled_reason and address_verified_at only. lat/lng are client-writable on
-- both INSERT and UPDATE today — a real, ALREADY-KNOWN gap, not a mistake in this
-- trigger (Ruling 18 in progress.md, corrected here in fix round 2 — an earlier
-- version of this comment cited the wrong ruling number and overstated its
-- conclusion). Ruling 18 did NOT decide "a forged coordinate proves nothing" —
-- nothing that reads address_verified_at is fooled (the readiness engine is
-- unaffected, since it gates on the stamp), BUT "Find Creators near me" is a live
-- feature that ranks on proximity and does NOT consult the stamp, so a planted
-- coordinate would place a creator in search results for a city they are not in.
-- Ruling 18 PARKED this — a marketplace-integrity issue with a bounded blast radius
-- (this migration's own trigger nulls lat/lng alongside the stamp on any legitimate
-- address edit, which bounds how long a planted value can survive), not something it
-- dismissed as harmless. Do not paper over the gap; closing it, if ever needed, is a
-- separate migration and a separate decision. UPSERT/ON CONFLICT DO UPDATE routes
-- through the UPDATE branch (documented
-- in DATABASE_SCHEMA.md's note on the collaboration-state-machine restoration), so it
-- is covered by the two triggers below.
--
-- Not SECURITY DEFINER — these functions only assign to NEW, nothing privileged
-- happens inside them, so DEFINER would be an elevation with no benefit (same
-- reasoning as 20260824111000's drop and 20260824120000's drop). Plain invoker
-- default, search_path pinned.
--
-- ORDERING DEPENDENCY WITH TASK 3'S GUARD TRIGGERS — real, not incidental, and it is
-- CORRECT ONLY BECAUSE OF THE TRIGGER NAMES. CORRECTED (task-7 fix round 2, Finding
-- B): an earlier version of this migration's fix-round-1 report claimed trigger firing
-- ORDER between Task 3's guard (guard_creator_profiles_verification_columns /
-- guard_org_units_verification_columns) and these two clearing triggers does not
-- matter for correctness. That is false. Postgres fires same-event BEFORE triggers on
-- one table in ALPHABETICAL ORDER BY TRIGGER NAME. "guard_..." sorts before
-- "trg_clear_...", so on every table the guard runs FIRST, while NEW still holds the
-- CLIENT's original submitted row (address_verified_at untouched, so NEW = OLD on that
-- column) — the guard's condition is false and it passes. THEN this migration's
-- trigger runs, sees the address column(s) changed, and nulls
-- address_verified_at/lat/lng.
--
-- If the order were reversed — e.g. either trigger renamed so it no longer sorts
-- guard-first — a ROUTINE, LEGITIMATE client address change would start hard-failing
-- for any row that currently carries a stamp. Walk it through: the clearing trigger
-- would run first, see the address column(s) changed, and null
-- NEW.address_verified_at. If OLD.address_verified_at was non-NULL (a real prior
-- verification), NEW.address_verified_at (now NULL) is DISTINCT FROM
-- OLD.address_verified_at. The guard trigger then runs second, sees exactly that
-- distinctness — which it can no longer tell apart from a forged client write — and
-- raises "verification columns are server-write-only" on a client caller who never
-- touched address_verified_at at all.
--
-- So: do not rename either trigger without re-verifying that "guard_*" still sorts
-- before "trg_clear_*_address_verification" on both creator_profiles and org_units.
-- This is not merely convenient — it is what makes a legitimate address edit and a
-- forged verification write distinguishable at all.

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
