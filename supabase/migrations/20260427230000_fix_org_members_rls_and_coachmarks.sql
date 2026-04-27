-- Fix three issues:
-- 1. org_members RLS infinite recursion (all 4 policies self-reference the table)
-- 2. Missing profiles.dismissed_coachmarks column (used by Coachmark component)
-- 3. analytics_events INSERT policy too strict (fails when user_id is set by trigger context)

-- ============================================================
-- 1. Replace org_members RLS policies with non-recursive versions
--    Strategy: use SECURITY DEFINER functions so the subqueries
--    bypass RLS, breaking the recursion chain.
-- ============================================================

-- Drop all existing recursive policies
drop policy if exists "members_select_same_org" on org_members;
drop policy if exists "members_insert_owner_admin" on org_members;
drop policy if exists "members_update_owner_admin" on org_members;
drop policy if exists "members_delete_owner_or_self" on org_members;

-- Helper: returns the set of org_ids the current user belongs to (active)
create or replace function get_user_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from org_members
  where user_id = auth.uid()
    and invitation_status = 'active';
$$;

-- Helper: check if caller is owner or admin of a given org
create or replace function is_org_owner_or_admin(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  );
$$;

-- SELECT: user can see own rows + rows in orgs they belong to
create policy "members_select_same_org"
  on org_members for select
  using (
    user_id = auth.uid()
    or org_id in (select get_user_org_ids())
  );

-- INSERT: only owners/admins can add members
create policy "members_insert_owner_admin"
  on org_members for insert
  with check (
    is_org_owner_or_admin(org_id)
  );

-- UPDATE: only owners/admins can update members
create policy "members_update_owner_admin"
  on org_members for update
  using (
    is_org_owner_or_admin(org_id)
  );

-- DELETE: owner/admin can delete any member, members can remove themselves
create policy "members_delete_owner_or_self"
  on org_members for delete
  using (
    user_id = auth.uid()
    or is_org_owner_or_admin(org_id)
  );

-- Also fix organizations SELECT policy which references org_members
drop policy if exists "org_select_members" on organizations;
create policy "org_select_members"
  on organizations for select
  using (
    id in (select get_user_org_ids())
  );

-- Fix org_units SELECT policy which references org_members
drop policy if exists "units_select_members" on org_units;
create policy "units_select_members"
  on org_units for select
  using (
    org_id in (select get_user_org_ids())
  );

-- ============================================================
-- 2. Add dismissed_coachmarks column to profiles
-- ============================================================

alter table profiles
  add column if not exists dismissed_coachmarks text[] default '{}';

-- ============================================================
-- 3. Fix analytics_events: allow service_role inserts (trigger context)
-- ============================================================

drop policy if exists "Authenticated users can insert analytics events" on analytics_events;

create policy "Authenticated users can insert analytics events"
  on analytics_events for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Service role can insert analytics events" on analytics_events;
create policy "Service role can insert analytics events"
  on analytics_events for insert to service_role
  with check (true);

-- ============================================================
-- 4. Replace remaining old policies on organizations / org_units
--    that still directly reference org_members (causing recursion
--    when they trigger org_members SELECT policy evaluation).
-- ============================================================

-- organizations: drop old SELECT duplicate
drop policy if exists "org_select_active_members" on organizations;

-- organizations: replace UPDATE policy
drop policy if exists "org_update_owner" on organizations;
create policy "org_update_owner"
  on organizations for update
  using (
    is_org_owner_or_admin(id)
  );

-- org_units: drop old SELECT duplicate
drop policy if exists "unit_select_members" on org_units;

-- org_units: replace INSERT/UPDATE/DELETE
drop policy if exists "unit_insert_owner_admin" on org_units;
create policy "unit_insert_owner_admin"
  on org_units for insert
  with check (
    is_org_owner_or_admin(org_id)
  );

drop policy if exists "unit_update_owner_admin" on org_units;
create policy "unit_update_owner_admin"
  on org_units for update
  using (
    is_org_owner_or_admin(org_id)
  );

drop policy if exists "unit_delete_owner_admin" on org_units;
create policy "unit_delete_owner_admin"
  on org_units for delete
  using (
    is_org_owner_or_admin(org_id)
  );
