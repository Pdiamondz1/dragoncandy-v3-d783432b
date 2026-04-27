-- ============================================================================
-- Team Accounts Migration
-- Adds organizations, org_units, org_members, account_deletion_requests
-- Column additions to profiles, campaigns, campaign_applications
-- RLS policies, security-definer functions, triggers, idempotent backfill
-- ============================================================================

-- ============================================================================
-- STEP 1: Create 4 new tables
-- ============================================================================

-- 1a. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null check (org_type in ('restaurant', 'brand')),
  slug text unique,
  logo_url text,
  billing_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'starter', 'growth', 'pro', 'enterprise')),
  seat_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hard_purge_at timestamptz
);

create index if not exists idx_organizations_type_deleted
  on organizations (org_type, deleted_at);

create index if not exists idx_organizations_stripe_customer
  on organizations (stripe_customer_id)
  where stripe_customer_id is not null;

-- 1b. Org Units (locations / products)
create table if not exists org_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  unit_type text not null check (unit_type in ('location', 'product')),
  name text not null,
  address text,
  lat numeric,
  lng numeric,
  website_url text,
  logo_url text,
  is_primary boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_units_org_deleted
  on org_units (org_id, deleted_at);

-- 1c. Org Members
create table if not exists org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'standard')),
  invited_by uuid references auth.users(id),
  invitation_status text not null default 'active'
    check (invitation_status in ('invited', 'active', 'suspended')),
  invited_at timestamptz,
  joined_at timestamptz,
  last_active_at timestamptz,
  unique (org_id, user_id)
);

create index if not exists idx_org_members_user_status
  on org_members (user_id, invitation_status);

-- 1d. Account Deletion Requests
create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id),
  target_type text not null check (target_type in ('org', 'org_unit', 'member', 'user_self')),
  target_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'soft_deleted', 'hard_purged', 'restored', 'rejected')),
  reason_code text,
  soft_deleted_at timestamptz,
  hard_purge_scheduled_at timestamptz,
  hard_purged_at timestamptz,
  restored_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- STEP 2: Add columns to existing tables
-- ============================================================================

alter table profiles
  add column if not exists org_id uuid references organizations(id),
  add column if not exists active_org_unit_id uuid references org_units(id);

alter table campaigns
  add column if not exists org_id uuid references organizations(id),
  add column if not exists org_unit_id uuid references org_units(id);

alter table campaign_applications
  add column if not exists org_id uuid references organizations(id);


-- ============================================================================
-- STEP 3: RLS policies for all new tables
-- ============================================================================

-- Enable RLS
alter table organizations enable row level security;
alter table org_units enable row level security;
alter table org_members enable row level security;
alter table account_deletion_requests enable row level security;

-- ---- organizations policies ----

create policy "org_select_active_members"
  on organizations for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

create policy "org_insert_authenticated"
  on organizations for insert
  with check (auth.role() = 'authenticated');

create policy "org_update_owner"
  on organizations for update
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
        and org_members.invitation_status = 'active'
    )
  );

-- ---- org_units policies ----

create policy "unit_select_members"
  on org_units for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_units.org_id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

create policy "unit_insert_owner_admin"
  on org_units for insert
  with check (
    exists (
      select 1 from org_members
      where org_members.org_id = org_units.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
        and org_members.invitation_status = 'active'
    )
  );

create policy "unit_update_owner_admin"
  on org_units for update
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_units.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
        and org_members.invitation_status = 'active'
    )
  );

create policy "unit_delete_owner_admin"
  on org_units for delete
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_units.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
        and org_members.invitation_status = 'active'
    )
  );

-- ---- org_members policies ----

create policy "members_select_same_org"
  on org_members for select
  using (
    exists (
      select 1 from org_members me
      where me.org_id = org_members.org_id
        and me.user_id = auth.uid()
        and me.invitation_status = 'active'
    )
  );

create policy "members_insert_owner_admin"
  on org_members for insert
  with check (
    exists (
      select 1 from org_members me
      where me.org_id = org_members.org_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
        and me.invitation_status = 'active'
    )
  );

create policy "members_update_owner_admin"
  on org_members for update
  using (
    exists (
      select 1 from org_members me
      where me.org_id = org_members.org_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
        and me.invitation_status = 'active'
    )
  );

create policy "members_delete_owner_or_self"
  on org_members for delete
  using (
    org_members.user_id = auth.uid()
    or exists (
      select 1 from org_members me
      where me.org_id = org_members.org_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
        and me.invitation_status = 'active'
    )
  );

-- ---- account_deletion_requests policies ----

create policy "deletion_select_requester_or_org_admin"
  on account_deletion_requests for select
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from org_members
      where org_members.org_id = account_deletion_requests.target_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
        and org_members.invitation_status = 'active'
    )
  );

create policy "deletion_insert_requester_or_org_admin"
  on account_deletion_requests for insert
  with check (
    requested_by = auth.uid()
    or exists (
      select 1 from org_members
      where org_members.org_id = account_deletion_requests.target_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
        and org_members.invitation_status = 'active'
    )
  );


-- ============================================================================
-- STEP 4: Security-definer functions
-- ============================================================================

-- 4a. request_org_deletion — owner-only soft delete
create or replace function request_org_deletion(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller is owner
  if not exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'owner'
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners can request deletion';
  end if;

  -- Soft-delete the organization
  update organizations
  set deleted_at = now(),
      hard_purge_at = now() + interval '30 days',
      updated_at = now()
  where id = p_org_id
    and deleted_at is null;

  -- Log the deletion request
  insert into account_deletion_requests (
    requested_by, target_type, target_id, status,
    soft_deleted_at, hard_purge_scheduled_at
  ) values (
    auth.uid(), 'org', p_org_id, 'soft_deleted',
    now(), now() + interval '30 days'
  );
end;
$$;

-- 4b. restore_org — owner-only restore within grace window
create or replace function restore_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller is owner
  if not exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Only org owners can restore an organization';
  end if;

  -- Verify still within grace window
  if not exists (
    select 1 from organizations
    where id = p_org_id
      and deleted_at is not null
      and hard_purge_at > now()
  ) then
    raise exception 'Organization is not in a restorable state or grace period has expired';
  end if;

  -- Restore the organization
  update organizations
  set deleted_at = null,
      hard_purge_at = null,
      updated_at = now()
  where id = p_org_id;

  -- Update the deletion request
  update account_deletion_requests
  set status = 'restored',
      restored_at = now()
  where target_type = 'org'
    and target_id = p_org_id
    and status = 'soft_deleted';
end;
$$;

-- 4c. force_gdpr_erasure — service-role hard purge, anonymizes creator refs
create or replace function force_gdpr_erasure(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anonymize profile
  update profiles
  set full_name = 'Deleted User',
      email = 'deleted_' || p_user_id || '@removed.invalid',
      avatar_url = null,
      updated_at = now()
  where id = p_user_id;

  -- Anonymize creator profile if exists
  update creator_profiles
  set creator_name = 'Deleted Creator',
      bio = null,
      avatar_url = null,
      portfolio_urls = null,
      instagram_url = null,
      tiktok_url = null,
      youtube_url = null,
      facebook_url = null,
      linkedin_url = null,
      x_url = null,
      other_social_url = null,
      website_url = null,
      updated_at = now()
  where user_id = p_user_id;

  -- Anonymize business profile if exists
  update business_profiles
  set business_name = 'Deleted Business',
      description = null,
      logo_url = null,
      website_url = null,
      instagram_url = null,
      tiktok_url = null,
      youtube_url = null,
      facebook_url = null,
      linkedin_url = null,
      x_url = null,
      other_social_url = null,
      updated_at = now()
  where user_id = p_user_id;

  -- Remove org memberships
  delete from org_members where user_id = p_user_id;

  -- Log the erasure
  insert into account_deletion_requests (
    requested_by, target_type, target_id, status, hard_purged_at, notes
  ) values (
    p_user_id, 'user_self', p_user_id, 'hard_purged', now(),
    'GDPR erasure executed'
  );
end;
$$;

-- 4d. cron_hard_purge_expired — finds expired orgs, anonymizes, deletes, returns count
create or replace function cron_hard_purge_expired()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
  v_count int := 0;
begin
  for v_org in
    select id from organizations
    where deleted_at is not null
      and hard_purge_at <= now()
  loop
    -- Anonymize members of this org before deleting
    update profiles
    set org_id = null,
        active_org_unit_id = null,
        updated_at = now()
    where org_id = v_org.id;

    -- Nullify campaign org references (preserve campaign history)
    update campaigns
    set org_id = null,
        org_unit_id = null,
        updated_at = now()
    where org_id = v_org.id;

    -- Nullify application org references
    update campaign_applications
    set org_id = null
    where org_id = v_org.id;

    -- Update deletion request to hard_purged
    update account_deletion_requests
    set status = 'hard_purged',
        hard_purged_at = now()
    where target_type = 'org'
      and target_id = v_org.id
      and status = 'soft_deleted';

    -- Delete the organization (cascades to org_units, org_members)
    delete from organizations where id = v_org.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


-- ============================================================================
-- STEP 5: Triggers
-- ============================================================================

-- 5a. Auto-populate org_id on campaigns from the inserting user's profile
create or replace function trg_campaigns_auto_org_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.org_id is null then
    select p.org_id, p.active_org_unit_id
    into NEW.org_id, NEW.org_unit_id
    from profiles p
    where p.id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_campaigns_auto_org on campaigns;
create trigger trg_campaigns_auto_org
  before insert on campaigns
  for each row
  execute function trg_campaigns_auto_org_fn();

-- 5b. Auto-populate org_id on campaign_applications from the campaign
create or replace function trg_applications_auto_org_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.org_id is null then
    select c.org_id
    into NEW.org_id
    from campaigns c
    where c.id = NEW.campaign_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_applications_auto_org on campaign_applications;
create trigger trg_applications_auto_org
  before insert on campaign_applications
  for each row
  execute function trg_applications_auto_org_fn();

-- 5c. Recompute seat_count on org_members changes
create or replace function trg_org_members_seat_count_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- Determine which org_id was affected
  if TG_OP = 'DELETE' then
    v_org_id := OLD.org_id;
  else
    v_org_id := NEW.org_id;
  end if;

  -- Recompute seat count (only active members)
  update organizations
  set seat_count = (
    select count(*)
    from org_members
    where org_id = v_org_id
      and invitation_status = 'active'
  ),
  updated_at = now()
  where id = v_org_id;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_org_members_seat_count on org_members;
create trigger trg_org_members_seat_count
  after insert or update or delete on org_members
  for each row
  execute function trg_org_members_seat_count_fn();

-- updated_at triggers for new tables
create trigger organizations_updated_at
  before update on organizations
  for each row execute function public.handle_updated_at();

create trigger org_units_updated_at
  before update on org_units
  for each row execute function public.handle_updated_at();


-- ============================================================================
-- STEP 6: Idempotent backfill
-- ============================================================================
-- For every business_profiles row that does NOT yet have an org_members row:
--   1. Create organization
--   2. Create default org_unit
--   3. Create org_members row (role=owner, status=active)
--   4. Update profiles.org_id and active_org_unit_id
--   5. Backfill campaigns.org_id and org_unit_id
-- Skips content_creator profiles entirely.

do $$
declare
  rec record;
  v_org_id uuid;
  v_unit_id uuid;
  v_org_type text;
  v_unit_type text;
begin
  for rec in
    select
      bp.user_id,
      bp.business_name,
      coalesce(bp.account_type, 'restaurant') as account_type,
      bp.location,
      bp.website_url,
      bp.logo_url
    from business_profiles bp
    where not exists (
      select 1 from org_members om where om.user_id = bp.user_id
    )
  loop
    -- Determine org_type from account_type
    v_org_type := case
      when rec.account_type = 'brand' then 'brand'
      else 'restaurant'
    end;

    -- Determine unit_type from org_type
    v_unit_type := case
      when v_org_type = 'brand' then 'product'
      else 'location'
    end;

    -- 1. Create organization
    insert into organizations (name, org_type, logo_url, billing_email)
    select
      coalesce(rec.business_name, 'My Workspace') || '''s Workspace',
      v_org_type,
      rec.logo_url,
      p.email
    from profiles p
    where p.id = rec.user_id
    returning id into v_org_id;

    -- 2. Create default org_unit
    insert into org_units (org_id, unit_type, name, address, website_url, logo_url, is_primary)
    values (
      v_org_id,
      v_unit_type,
      coalesce(rec.business_name, 'Primary'),
      rec.location,
      rec.website_url,
      rec.logo_url,
      true
    )
    returning id into v_unit_id;

    -- 3. Create org_members row
    insert into org_members (org_id, user_id, role, invitation_status, joined_at)
    values (v_org_id, rec.user_id, 'owner', 'active', now());

    -- 4. Update profiles
    update profiles
    set org_id = v_org_id,
        active_org_unit_id = v_unit_id,
        updated_at = now()
    where id = rec.user_id;

    -- 5. Backfill campaigns
    update campaigns
    set org_id = v_org_id,
        org_unit_id = v_unit_id,
        updated_at = now()
    where user_id = rec.user_id
      and org_id is null;

    -- 5b. Backfill campaign_applications via campaigns
    update campaign_applications ca
    set org_id = v_org_id
    from campaigns c
    where c.id = ca.campaign_id
      and c.user_id = rec.user_id
      and ca.org_id is null;

  end loop;
end;
$$;
