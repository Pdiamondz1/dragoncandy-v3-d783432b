-- Verification stamps must be server-write-only.
--
-- `authenticated` held UPDATE and INSERT on profiles.phone_verified_at, so any signed-in
-- user could stamp themselves phone-verified without ever receiving an SMS. Inert until
-- slice 2 gives the column meaning; closed here, first.
--
-- A COLUMN-level REVOKE is a documented no-op against Supabase's ambient table-wide GRANT
-- (see 20260804174854, 20260805163247). The working pattern is table-wide revoke, then
-- grant back an explicit column list — the same shape 20260808010000 used for
-- campaign_invitations.

revoke update on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;

-- Every column the client legitimately UPDATEs, enumerated from src/ at plan time:
--   AuthContext.tsx:238 active_org_unit_id · FileUploadSection.tsx:106 avatar_url
--   DeleteUserSheet.tsx:58 full_name/avatar_url/org_id/active_org_unit_id
--   LeaveOrgSheet.tsx:34 org_id/active_org_unit_id · AvatarUpload.tsx:74 avatar_url
--   DonnyAutoPilot.tsx:35 auto_pilot_enabled · useAccountReadiness.ts:205 dismissed_requirements
--   useFirstRunMissions.ts:40 first_run_missions · useOrgData.ts:166 active_org_unit_id
--   useBusinessProfileSubmit.ts:123 / useCreatorProfileSubmit.ts:109 avatar_url
--   RestoreAccountPage.tsx:29 / InviteAcceptPage.tsx:65 org_id
grant update (
  active_org_unit_id,
  auto_pilot_enabled,
  avatar_url,
  dismissed_requirements,
  first_run_missions,
  full_name,
  org_id
) on public.profiles to authenticated;

-- OnboardingWizard.tsx:190 upserts with ON CONFLICT DO NOTHING. Keep it working.
grant insert (
  id,
  email,
  role,
  full_name,
  email_verified
) on public.profiles to authenticated;

-- Assert the resulting grant set. PUBLIC is included in the filter deliberately: a
-- table-wide GRANT ... TO PUBLIC is recorded under that grantee, so omitting it would
-- make this assertion unfailable — the trap 20260808010000 documents.
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
end $$;
