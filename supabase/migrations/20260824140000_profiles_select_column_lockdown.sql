-- Close the TABLE SELECT path on profiles PII. It does NOT close every path -- see the
-- "What this does not close" note at the bottom of this header before relying on it.
--
-- RLS has no column granularity, and the "View messaging participants profiles" policy
-- grants the whole row to any messaging counterparty. With table-wide SELECT held by
-- anon and authenticated, that exposes every column -- including email, and (as of the
-- verify-phone function) phone.
--
-- Proven on prod, not inferred (see task-5b-brief.md): impersonating a real messaging
-- counterparty of a real user returned that user's email and phone columns; an
-- unrelated control uuid returned 0 rows, which is what makes it evidence.
--
-- The two historical `REVOKE SELECT (email)` statements (20260507130028, 20260523234847)
-- were COLUMN-level and are the documented no-op against an outstanding table-wide GRANT
-- -- same lesson as 20260804174854, 20260805163247, and outstand_post_ownership. This is
-- the fourth instance. Revoke at TABLE level first, then grant back an enumerated list.
--
-- Grant-back list (15 columns, both roles -- see profiles-select-inventory.md §4/§6; no
-- evidence anon/authenticated need different lists) is every profiles column EXCEPT
-- `email` and `phone`. Taken verbatim from the controller's Ruling 14, not re-derived by
-- grep here -- the `dismissed_coachmarks` incident on the UPDATE/INSERT lockdown
-- (20260824100000) happened because a fresh single-quote-only grep missed a
-- double-quoted call site. dismissed_coachmarks IS on this list.
--
-- ---------------------------------------------------------------------------------
-- WHAT THIS DOES NOT CLOSE. Read this before citing this migration as the fix.
--
-- A REVOKE on the table does nothing to a SECURITY DEFINER function, which runs with
-- its owner's privileges and bypasses both grants and RLS. Two such functions still
-- reach profiles.email after this migration lands. Both are PRE-EXISTING and neither
-- is touched here:
--
--   1. get_user_conversations(user_uuid, p_org_unit_id) -- 20260609010000. A live
--      IDOR, verified on prod 2026-08-23. Its body references auth.uid() NOWHERE and
--      every filter runs on the caller-supplied user_uuid; EXECUTE is held by PUBLIC,
--      anon and authenticated with no REVOKE. Measured, with controls: a caller whose
--      own list is 1 row read 13 rows belonging to two other users; a nonexistent uuid
--      returned 0, ruling out "it ignores the parameter"; and `set local role anon`
--      with no JWT returned 13 rows, so it needs no account at all. It exposes
--      conversation ids, campaign ids and unread counts. Its other_participant_name is
--      COALESCE(..., p.full_name, p.email, ...), so it is one NULL full_name away from
--      returning addresses -- all 45 profiles currently have a full_name, so that half
--      is latent, not live. Do not restate it as "returns raw email".
--
--   2. get_recipient_email(p_user_id) -- 20260523234847. SECURITY DEFINER, granted to
--      authenticated, returns another user's email to any messaging counterparty. Used
--      deliberately by src/lib/recipientEmail.ts. Whether that is a feature or a leak
--      is an open product question, not a settled one.
--
-- So: this migration closes the anon/table-wide path, which was the broad exposure and
-- the one that would have published every verified phone number. It does not make
-- profiles.email unreachable, and nothing here should be read as claiming it does.
-- ---------------------------------------------------------------------------------

revoke select on public.profiles from anon, authenticated;

grant select (
  active_org_unit_id,
  auto_pilot_enabled,
  avatar_url,
  created_at,
  dismissed_coachmarks,
  dismissed_requirements,
  donny_system_conversation_id,
  email_verified,
  first_run_missions,
  full_name,
  id,
  org_id,
  phone_verified_at,
  role,
  updated_at
) on public.profiles to authenticated;

grant select (
  active_org_unit_id,
  auto_pilot_enabled,
  avatar_url,
  created_at,
  dismissed_coachmarks,
  dismissed_requirements,
  donny_system_conversation_id,
  email_verified,
  first_run_missions,
  full_name,
  id,
  org_id,
  phone_verified_at,
  role,
  updated_at
) on public.profiles to anon;

-- Two call sites read `email` today (profiles-select-inventory.md §3). Neither is fixed
-- by the grant-back above -- a column GRANT is table-wide, not policy-scoped, so adding
-- `email` back for `useOrgMembers.ts` would reopen the exact messaging-counterparty leak
-- this migration closes, for every authenticated user, just to serve one admin roster
-- screen.
--
--   1. src/hooks/useMessageQueries.ts:48-51 selected `email` and never consumed it (the
--      local type and destructuring only ever use `id, full_name`). Fixed by dropping
--      `email` from that `.select()` -- no schema change needed, done alongside this file.
--
--   2. src/hooks/useOrgMembers.ts:59 is a deliberate feature: the org member roster shows
--      teammate emails. Replaced by the RPC below, which reads profiles.email with the
--      function owner's privileges (SECURITY DEFINER) rather than the caller's grants,
--      scoped to orgs the caller is an ACTIVE member of.

create or replace function public.get_org_members_roster(p_org_id uuid)
returns table (
  id uuid,
  org_id uuid,
  user_id uuid,
  role text,
  invited_by uuid,
  invitation_status text,
  invited_at timestamptz,
  joined_at timestamptz,
  last_active_at timestamptz,
  full_name text,
  email text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden: authentication required';
  end if;

  -- Identity comes only from auth.uid() -- there is no user-id parameter for a caller
  -- to point at someone else. Gate on the CALLER being an ACTIVE member of p_org_id,
  -- mirroring the invitation_status = 'active' predicate can_notify_user's org clause
  -- uses (20260810193000): a merely-invited or suspended row is not a colleague and
  -- must not unlock the roster.
  if not exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.invitation_status = 'active'
  ) then
    raise exception 'forbidden: not an active member of this organization';
  end if;

  -- The returned ROSTER keeps the original hook's `.neq('invitation_status', 'suspended')`
  -- shape -- invited + active members are shown, suspended ones are not. That is a
  -- different predicate from the access gate above on purpose: who may CALL this (active
  -- members only) is not the same question as which ROWS it shows (invited rows included,
  -- so a pending invite still appears on the roster to the members who invited them).
  return query
    select m.id, m.org_id, m.user_id, m.role, m.invited_by, m.invitation_status,
           m.invited_at, m.joined_at, m.last_active_at,
           p.full_name, p.email, p.avatar_url
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id
      and m.invitation_status <> 'suspended'
    order by m.role asc, m.joined_at asc;
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated via ALTER DEFAULT PRIVILEGES, so a bare
-- `revoke from public` does NOT lock this down (the dre_my_standing gotcha, 20260807120000).
revoke execute on function public.get_org_members_roster(uuid) from public, anon, authenticated;
grant execute on function public.get_org_members_roster(uuid) to authenticated;

-- Assert the resulting grant set. PUBLIC is included in every filter deliberately: a
-- table-wide GRANT ... TO PUBLIC is recorded under that grantee, and omitting it would
-- make this assertion unfailable -- the trap 20260808010000 documents.
do $$
declare
  leaked text;
  missing text;
begin
  -- 1. No table-wide SELECT remains for anon/authenticated/PUBLIC on profiles.
  select string_agg(distinct grantee || ':' || privilege_type, ', ')
    into leaked
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type = 'SELECT';

  if leaked is not null then
    raise exception 'table-wide SELECT still present on profiles: %', leaked;
  end if;

  -- 2. email/phone must be absent from column grants for anon/authenticated/PUBLIC.
  select string_agg(distinct grantee || ':' || column_name, ', ')
    into leaked
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and privilege_type = 'SELECT'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and column_name in ('email', 'phone');

  if leaked is not null then
    raise exception 'email/phone still SELECT-granted on profiles: %', leaked;
  end if;

  -- 3. Every column on the grant-back list must be present for BOTH anon and authenticated.
  select string_agg(pair, ', ') into missing
  from (
    select r.grantee || ':' || c.col as pair
    from (values ('anon'), ('authenticated')) as r(grantee)
    cross join (values
      ('active_org_unit_id'), ('auto_pilot_enabled'), ('avatar_url'), ('created_at'),
      ('dismissed_coachmarks'), ('dismissed_requirements'), ('donny_system_conversation_id'),
      ('email_verified'), ('first_run_missions'), ('full_name'), ('id'), ('org_id'),
      ('phone_verified_at'), ('role'), ('updated_at')
    ) as c(col)
    where not exists (
      select 1
      from information_schema.column_privileges cp
      where cp.table_schema = 'public'
        and cp.table_name = 'profiles'
        and cp.privilege_type = 'SELECT'
        and cp.grantee = r.grantee
        and cp.column_name = c.col
    )
  ) x;

  if missing is not null then
    raise exception 'grant-back list did not land for: %', missing;
  end if;
end $$;
