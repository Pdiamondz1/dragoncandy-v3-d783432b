-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260808013409 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

drop policy if exists "Creators can update invitations sent to them" on public.campaign_invitations;

create policy "Creators can decline their own pending invitations"
  on public.campaign_invitations
  for update
  to authenticated
  using (auth.uid() = creator_id and status = 'pending')
  with check (auth.uid() = creator_id and status = 'declined');

revoke update on public.campaign_invitations from authenticated, anon;

grant update (status) on public.campaign_invitations to authenticated;

do $$
declare
  v_cols text;
begin
  select string_agg(grantee || ':' || column_name, ', ' order by grantee, column_name)
    into v_cols
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name   = 'campaign_invitations'
    and privilege_type = 'UPDATE'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  raise notice 'campaign_invitations UPDATE column grants: %', coalesce(v_cols, '<none>');

  if v_cols is distinct from 'authenticated:status' then
    raise exception
      'Unexpected UPDATE column grants on campaign_invitations: % (expected exactly authenticated:status)',
      coalesce(v_cols, '<none>');
  end if;
end $$;
