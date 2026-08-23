-- Follow-up to 20260824100000: that migration's write-surface enumeration grepped only
-- `from('profiles')` (single quotes) and missed `dismissed_coachmarks`, written via
-- `from("profiles")` (double quotes) at src/components/guidance/Coachmark.tsx:50. The
-- table-wide REVOKE in 20260824100000 removed the ambient ability to write this column
-- along with everything else, so it now 42501s on prod — a live regression, since it was
-- writable before that migration.
--
-- Does NOT touch the REVOKE or any other column in the grant set. 20260824100000 is
-- already applied to prod with its ledger row recorded; it is not edited or re-run.

grant update (
  dismissed_coachmarks
) on public.profiles to authenticated;

-- Re-assert nothing else leaked and this column is now covered, using the same
-- PUBLIC-inclusive filter shape as 20260824100000 (a table-wide GRANT ... TO PUBLIC is
-- recorded under grantee 'PUBLIC', so omitting it would make this assertion unfailable).
do $$
declare
  leaked text;
  missing text;
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
      and column_name = 'dismissed_coachmarks'
  ) then
    raise exception 'dismissed_coachmarks grant did not take';
  end if;
end $$;
