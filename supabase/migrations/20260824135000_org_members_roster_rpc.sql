-- The org-roster RPC, split out of 20260824140000 so it can be applied BEFORE merge.
--
-- WHY THIS IS A SEPARATE FILE. 20260824140000 originally bundled two changes with
-- OPPOSITE ordering requirements against the frontend deploy:
--
--   * this function is backward-COMPATIBLE and must exist BEFORE the new
--     src/hooks/useOrgMembers.ts ships, or every org owner's roster throws PGRST202;
--   * the table-wide SELECT revoke in 20260824140000 is backward-INCOMPATIBLE and must
--     land AFTER that deploy, or the OLD frontend (which selects profiles.email
--     directly) breaks for every user.
--
-- While they were one file there was NO apply order without a broken window. Split, the
-- window is zero: apply this one before merge, and 20260824140000 after Vercel finishes
-- deploying. (Found by the whole-branch review; corrects Ruling 15, which treated the
-- file as a single ordered unit.)
--
-- Applying this early is safe on its own: it only ADDS a function. Nothing calls it
-- until the frontend ships, and profiles.email stays exactly as reachable as it is today
-- until the revoke lands.

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
