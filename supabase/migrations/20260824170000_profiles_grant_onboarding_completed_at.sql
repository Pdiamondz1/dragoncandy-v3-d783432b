-- Follow-up to 20260824100000 (and its first follow-up 20260824101000): the write-surface
-- enumeration missed `onboarding_completed_at`, written at src/hooks/useTour.ts:28 via
-- `from("profiles")` — DOUBLE quotes, the identical blind spot that missed
-- `dismissed_coachmarks` in 20260824101000. The table-wide REVOKE in 20260824100000 removed
-- the ambient ability to write this column, so completing the product tour now 42501s on
-- prod. `useTour.completeMutation` does not check the returned error, so the failure is
-- SILENT: the tour reports success locally, the row never records completion, and the tour
-- re-arms on the next session. Found by the Codex second review.
--
-- Does NOT touch the REVOKE or any other column. 20260824100000 and 20260824101000 are
-- already applied to prod with their ledger rows recorded; neither is edited or re-run.
--
-- THIS IS THE SECOND MISS OF THE SAME KIND, so the fix is not only the grant. A quote-style
-- grep is a human process that has now failed twice in the same way, and a third failure
-- would again surface as a silent 42501 in production rather than as a test failure. The
-- durable half of this fix lives in src/lib/profilesWriteGrants.test.ts, which enumerates
-- every client write to `profiles` out of src/ (quote-agnostic) and asserts each written
-- column appears in the granted set parsed from these migrations. That test runs in CI on
-- every change, which is the property a one-shot migration assertion can never have.

-- ---------------------------------------------------------------------------------
-- PROD DRIFT, found when this migration first failed to apply (2026-08-23):
--   ERROR: 42703: column "onboarding_completed_at" of relation "profiles" does not exist
--
-- Migration 20260427110000 is RECORDED in supabase_migrations.schema_migrations, and its
-- repo file adds `onboarding_completed_at` and `dismissed_coachmarks` in ONE atomic
-- `alter table ... add column, add column`. On prod, `dismissed_coachmarks` exists and
-- `onboarding_completed_at` does not. A single ALTER cannot half-apply, so what ran against
-- prod was not what the repo file says. Third recorded instance of `recorded ≠ actual` in
-- this project, after the collaboration state machine (#325) and the handle_updated_at stub
-- (#385). Verify objects, never the ledger.
--
-- Adding it here rather than dropping the write, because prod is the OUTLIER: the repo says
-- this column exists, so staging, preview branches and any fresh environment already have
-- it. Leaving prod diverged is what produced this failure. Additive and nullable, per the
-- project rule on new columns.
--
-- HONEST NOTE ON WHAT THIS DOES *NOT* FIX. `onboarding_completed_at` is WRITE-ONLY:
-- src/hooks/useTour.ts is the only writer and nothing in src/ reads it. Tour suppression
-- runs off sessionStorage, so the tour re-arms every new session and has done since April.
-- This migration makes the write SUCCEED; it does not make the tour remember anything.
-- Whether tour completion should persist across sessions is a product decision, not a
-- schema one, and is deliberately left to the founder rather than smuggled in here.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

grant update (
  onboarding_completed_at
) on public.profiles to authenticated;

-- Same PUBLIC-inclusive filter shape as both predecessors: a table-wide GRANT ... TO PUBLIC
-- is recorded under grantee 'PUBLIC', so omitting it would make this assertion unfailable.
do $$
declare
  leaked text;
begin
  select string_agg(distinct grantee || ':' || privilege_type || ':' || column_name, ', ')
    into leaked
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type in ('UPDATE', 'INSERT')
    and column_name in ('phone_verified_at', 'email_verified')
    and not (grantee = 'authenticated' and privilege_type = 'INSERT' and column_name = 'email_verified');

  if leaked is not null then
    raise exception 'verification columns still client-writable: %', leaked;
  end if;

  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name = 'onboarding_completed_at'
  ) then
    raise exception 'onboarding_completed_at grant did not take';
  end if;
end $$;
