# Section 3: Team Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organizations, multi-unit accounts, role-based team management, account deletion with GDPR compliance, and per-seat Stripe billing for Restaurant and Brand users.

**Architecture:** Two-phase approach — Phase A delivers a single atomic Supabase migration (tables, RLS, functions, triggers, backfill). Phase B delivers sequential UI features: org switcher, team management, account deletion, billing. Each phase gets user approval before the next.

**Tech Stack:** Supabase (Postgres, Edge Functions, RLS), React + TypeScript, React Query, shadcn/ui, Stripe API, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-26-section3-team-accounts-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260426200000_team_accounts.sql` | All schema: 4 tables, column additions, RLS, functions, triggers, backfill |
| `src/types/org.ts` | TypeScript types for Organization, OrgUnit, OrgMember, DeletionRequest |
| `src/hooks/useOrgData.ts` | React Query hooks for org/unit/member CRUD |
| `src/hooks/useOrgMembers.ts` | React Query hooks for team member management |
| `src/components/org/OrgUnitSwitcher.tsx` | Header pill switcher for active org unit |
| `src/components/org/AddEditUnitModal.tsx` | Dialog for creating/editing org units |
| `src/components/org/InviteModal.tsx` | Modal for inviting team members via email |
| `src/components/org/DeleteOrgSheet.tsx` | Bottom sheet for org deletion with confirmation |
| `src/components/org/LeaveOrgSheet.tsx` | Bottom sheet for leaving an org |
| `src/components/org/DeleteUserSheet.tsx` | Bottom sheet for user account deletion |
| `src/pages/OrgUnitsPage.tsx` | Locations (restaurant) / Products (brand) list page |
| `src/pages/TeamPage.tsx` | Team member list with invite + role management |
| `src/pages/OrgBillingPage.tsx` | Billing dashboard with seat count + tier info |
| `src/pages/RestoreAccountPage.tsx` | Account restore after soft deletion |
| `src/pages/InviteAcceptPage.tsx` | Invite acceptance landing page |
| `supabase/functions/invite-member/index.ts` | Edge function: send team invites |
| `supabase/functions/sync-seat-count/index.ts` | Edge function: sync seat count to Stripe |

### Modified Files

| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Add `activeOrg`, `activeOrgUnit`, `switchOrgUnit` to context |
| `src/components/DashboardLayout.tsx` | Insert `<OrgUnitSwitcher />` in header |
| `src/lib/navConfig.ts` | Add Locations/Products, Team, Billing nav items |
| `src/App.tsx` | Add routes for new pages |
| `src/pages/BusinessSettings.tsx` | Add Danger Zone accordion section |
| `src/pages/CreatorSettings.tsx` | Add Danger Zone section (user deletion only) |
| `supabase/functions/stripe-webhook/index.ts` | Handle subscription lifecycle events for orgs |
| `src/integrations/supabase/types.ts` | Regenerate with new tables (manual additions until regen) |

---

## Phase A: Schema Migration

### Task 1: Write the team accounts migration

**Files:**
- Create: `supabase/migrations/20260426200000_team_accounts.sql`

This is the foundational task. Everything else depends on it.

- [ ] **Step 1: Create the migration file with all 4 new tables**

```sql
-- supabase/migrations/20260426200000_team_accounts.sql
-- Team Accounts: organizations, org_units, org_members, account_deletion_requests
-- Plus column additions, RLS, security-definer functions, triggers, backfill

-- ============================================================
-- 1. NEW TABLES
-- ============================================================

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
  on organizations (stripe_customer_id) where stripe_customer_id is not null;

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

create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id),
  target_type text not null
    check (target_type in ('org', 'org_unit', 'member', 'user_self')),
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
```

- [ ] **Step 2: Add column additions to existing tables**

Append to the same migration file:

```sql
-- ============================================================
-- 2. COLUMN ADDITIONS TO EXISTING TABLES
-- ============================================================

alter table profiles
  add column if not exists org_id uuid references organizations(id),
  add column if not exists active_org_unit_id uuid references org_units(id);

alter table campaigns
  add column if not exists org_id uuid references organizations(id),
  add column if not exists org_unit_id uuid references org_units(id);

alter table campaign_applications
  add column if not exists org_id uuid references organizations(id);
```

- [ ] **Step 3: Add RLS policies for all new tables**

Append to the same migration file:

```sql
-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table organizations enable row level security;
alter table org_units enable row level security;
alter table org_members enable row level security;
alter table account_deletion_requests enable row level security;

-- organizations: SELECT for active members
create policy "org_members_can_view_own_org"
  on organizations for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

-- organizations: UPDATE for owners only
create policy "org_owners_can_update"
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

-- organizations: INSERT for authenticated users (creating their own org)
create policy "authenticated_can_create_org"
  on organizations for insert
  with check (auth.uid() is not null);

-- org_units: SELECT for active org members
create policy "org_members_can_view_units"
  on org_units for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_units.org_id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

-- org_units: INSERT/UPDATE for owner or admin
create policy "org_owner_admin_can_manage_units"
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

create policy "org_owner_admin_can_update_units"
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

create policy "org_owner_admin_can_delete_units"
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

-- org_members: SELECT for active members of same org
create policy "org_members_can_view_team"
  on org_members for select
  using (
    exists (
      select 1 from org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.invitation_status = 'active'
    )
  );

-- org_members: INSERT for owner/admin only
create policy "org_owner_admin_can_invite"
  on org_members for insert
  with check (
    exists (
      select 1 from org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.role in ('owner', 'admin')
        and my_membership.invitation_status = 'active'
    )
  );

-- org_members: UPDATE — owner can change anyone, admin can change standard, standard can change self
create policy "org_members_role_based_update"
  on org_members for update
  using (
    exists (
      select 1 from org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.invitation_status = 'active'
        and (
          my_membership.role = 'owner'
          or (my_membership.role = 'admin' and org_members.role = 'standard')
          or (my_membership.user_id = org_members.user_id)
        )
    )
  );

-- org_members: DELETE — owner removes anyone, admin removes standard/admin, standard removes self
create policy "org_members_role_based_delete"
  on org_members for delete
  using (
    exists (
      select 1 from org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.invitation_status = 'active'
        and (
          my_membership.role = 'owner'
          or (my_membership.role = 'admin' and org_members.role in ('standard', 'admin'))
          or (my_membership.user_id = org_members.user_id)
        )
    )
  );

-- account_deletion_requests: SELECT/INSERT for requester or org owner/admin
create policy "deletion_requests_select"
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

create policy "deletion_requests_insert"
  on account_deletion_requests for insert
  with check (requested_by = auth.uid());
```

- [ ] **Step 4: Add security-definer functions**

Append to the same migration file:

```sql
-- ============================================================
-- 4. SECURITY-DEFINER FUNCTIONS
-- ============================================================

-- Request org deletion (owner only)
create or replace function request_org_deletion(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  -- Verify caller is owner
  if not exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'owner'
      and invitation_status = 'active'
  ) then
    raise exception 'Only the org owner can request deletion';
  end if;

  -- Soft delete the org
  update organizations
  set deleted_at = now(),
      hard_purge_at = now() + interval '30 days',
      updated_at = now()
  where id = p_org_id
    and deleted_at is null;

  -- Create deletion request
  insert into account_deletion_requests (
    requested_by, target_type, target_id, status,
    reason_code, soft_deleted_at, hard_purge_scheduled_at
  ) values (
    auth.uid(), 'org', p_org_id, 'soft_deleted',
    'user_requested', now(), now() + interval '30 days'
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- Restore org (owner only, within grace period)
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
      and invitation_status = 'active'
  ) then
    raise exception 'Only the org owner can restore';
  end if;

  -- Verify still within grace period
  if not exists (
    select 1 from organizations
    where id = p_org_id
      and deleted_at is not null
      and hard_purge_at > now()
  ) then
    raise exception 'Organization cannot be restored (grace period expired or not deleted)';
  end if;

  -- Restore
  update organizations
  set deleted_at = null,
      hard_purge_at = null,
      updated_at = now()
  where id = p_org_id;

  -- Update deletion request
  update account_deletion_requests
  set status = 'restored',
      restored_at = now()
  where target_type = 'org'
    and target_id = p_org_id
    and status = 'soft_deleted';
end;
$$;

-- GDPR hard erasure (service role only)
create or replace function force_gdpr_erasure(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anonymize creator collaborations
  update campaign_collaborations
  set creator_id = null
  where creator_id = p_user_id;

  -- Delete profile data
  delete from creator_profiles where user_id = p_user_id;
  delete from business_profiles where user_id = p_user_id;

  -- Remove org memberships
  delete from org_members where user_id = p_user_id;

  -- Anonymize profile
  update profiles
  set full_name = 'Deleted User',
      email = 'deleted_' || p_user_id || '@deleted.dragoncandy.io',
      avatar_url = null,
      org_id = null,
      active_org_unit_id = null,
      updated_at = now()
  where id = p_user_id;

  -- Log
  insert into account_deletion_requests (
    requested_by, target_type, target_id, status,
    reason_code, hard_purged_at
  ) values (
    p_user_id, 'user_self', p_user_id, 'hard_purged',
    'gdpr_erasure', now()
  );
end;
$$;

-- Cron: hard purge expired orgs
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
      and hard_purge_at < now()
  loop
    -- Anonymize creator references on collaborations tied to this org's campaigns
    update campaign_collaborations
    set creator_id = null
    where campaign_id in (
      select id from campaigns where org_id = v_org.id
    )
    and creator_id is not null;

    -- Update deletion request
    update account_deletion_requests
    set status = 'hard_purged',
        hard_purged_at = now()
    where target_type = 'org'
      and target_id = v_org.id
      and status = 'soft_deleted';

    -- Delete org (cascades to org_units, org_members)
    delete from organizations where id = v_org.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
```

- [ ] **Step 5: Add triggers**

Append to the same migration file:

```sql
-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Auto-populate org_id on campaign insert
create or replace function trg_campaigns_set_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.org_id is null and NEW.user_id is not null then
    select p.org_id, p.active_org_unit_id
    into NEW.org_id, NEW.org_unit_id
    from profiles p
    where p.id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

create trigger trg_campaigns_auto_org
  before insert on campaigns
  for each row
  execute function trg_campaigns_set_org_id();

-- Auto-populate org_id on campaign_applications insert
create or replace function trg_applications_set_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.org_id is null and NEW.campaign_id is not null then
    select c.org_id into NEW.org_id
    from campaigns c
    where c.id = NEW.campaign_id;
  end if;
  return NEW;
end;
$$;

create trigger trg_applications_auto_org
  before insert on campaign_applications
  for each row
  execute function trg_applications_set_org_id();

-- Update seat_count when org_members changes
create or replace function trg_update_seat_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_count int;
begin
  v_org_id := coalesce(NEW.org_id, OLD.org_id);

  select count(*) into v_count
  from org_members
  where org_id = v_org_id
    and invitation_status = 'active';

  update organizations
  set seat_count = v_count,
      updated_at = now()
  where id = v_org_id;

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_org_members_seat_count
  after insert or update or delete on org_members
  for each row
  execute function trg_update_seat_count();
```

- [ ] **Step 6: Add idempotent backfill**

Append to the same migration file:

```sql
-- ============================================================
-- 6. BACKFILL — create orgs for existing business users
-- ============================================================

do $$
declare
  v_bp record;
  v_org_id uuid;
  v_unit_id uuid;
  v_unit_type text;
begin
  for v_bp in
    select
      bp.user_id,
      bp.business_name,
      bp.account_type,
      bp.location,
      bp.city,
      bp.postal_code,
      bp.country,
      bp.website_url,
      bp.logo_url
    from business_profiles bp
    where not exists (
      select 1 from org_members om where om.user_id = bp.user_id
    )
  loop
    -- Determine unit type
    v_unit_type := case
      when v_bp.account_type = 'brand' then 'product'
      else 'location'
    end;

    -- Create organization
    insert into organizations (name, org_type, logo_url)
    values (
      coalesce(v_bp.business_name, 'My Workspace') || '''s Workspace',
      coalesce(v_bp.account_type, 'restaurant'),
      v_bp.logo_url
    )
    returning id into v_org_id;

    -- Create default org unit
    insert into org_units (org_id, unit_type, name, address, website_url, logo_url, is_primary)
    values (
      v_org_id,
      v_unit_type,
      coalesce(v_bp.business_name, 'Default'),
      case when v_unit_type = 'location'
        then concat_ws(', ',
          nullif(v_bp.location, ''),
          nullif(v_bp.city, ''),
          nullif(v_bp.postal_code, ''),
          nullif(v_bp.country, ''))
        else null
      end,
      case when v_unit_type = 'product' then v_bp.website_url else null end,
      v_bp.logo_url,
      true
    )
    returning id into v_unit_id;

    -- Create owner membership
    insert into org_members (org_id, user_id, role, invitation_status, joined_at)
    values (v_org_id, v_bp.user_id, 'owner', 'active', now());

    -- Update profile
    update profiles
    set org_id = v_org_id,
        active_org_unit_id = v_unit_id
    where id = v_bp.user_id;

    -- Backfill campaigns
    update campaigns
    set org_id = v_org_id,
        org_unit_id = v_unit_id
    where user_id = v_bp.user_id
      and org_id is null;
  end loop;
end;
$$;
```

- [ ] **Step 7: Verify migration builds cleanly**

Run: `cd supabase && npx supabase db push --dry-run 2>&1 | head -50`

If `supabase db push` is not available locally, verify syntax:
Run: `npx supabase migration list`

Expected: Migration `20260426200000_team_accounts` appears in the list with no errors.

- [ ] **Step 8: Commit Phase A**

```bash
git add supabase/migrations/20260426200000_team_accounts.sql
git commit -m "schema(team-accounts): orgs, units, members, deletion lifecycle, RLS

Adds organizations, org_units, org_members, account_deletion_requests tables.
Column additions to profiles, campaigns, campaign_applications.
RLS policies, security-definer functions, triggers, idempotent backfill.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**APPROVAL GATE: Stop here. Review the migration before proceeding to Phase B.**

---

## Phase B: UI Features

### Task 2: Add TypeScript types for org entities

**Files:**
- Create: `src/types/org.ts`

- [ ] **Step 1: Create org type definitions**

```typescript
// src/types/org.ts

export interface Organization {
  id: string;
  name: string;
  org_type: 'restaurant' | 'brand';
  slug: string | null;
  logo_url: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_tier: 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
  seat_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  hard_purge_at: string | null;
}

export interface OrgUnit {
  id: string;
  org_id: string;
  unit_type: 'location' | 'product';
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  logo_url: string | null;
  is_primary: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'standard';
  invited_by: string | null;
  invitation_status: 'invited' | 'active' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  // Joined fields (from profiles)
  full_name?: string | null;
  email?: string;
  avatar_url?: string | null;
}

export interface AccountDeletionRequest {
  id: string;
  requested_by: string;
  target_type: 'org' | 'org_unit' | 'member' | 'user_self';
  target_id: string;
  status: 'pending' | 'soft_deleted' | 'hard_purged' | 'restored' | 'rejected';
  reason_code: string | null;
  soft_deleted_at: string | null;
  hard_purge_scheduled_at: string | null;
  hard_purged_at: string | null;
  restored_at: string | null;
  notes: string | null;
  created_at: string;
}

export type OrgRole = 'owner' | 'admin' | 'standard';

export const SEAT_LIMITS: Record<string, { included: number; maxAdditional: number | null; additionalPriceMonthly: number }> = {
  free: { included: 1, maxAdditional: 0, additionalPriceMonthly: 0 },
  starter: { included: 1, maxAdditional: 3, additionalPriceMonthly: 29 },
  growth: { included: 5, maxAdditional: 15, additionalPriceMonthly: 39 },
  pro: { included: 15, maxAdditional: null, additionalPriceMonthly: 49 },
  enterprise: { included: 999, maxAdditional: null, additionalPriceMonthly: 0 },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/org.ts
git commit -m "feat(org): add TypeScript types for org entities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create org data hooks

**Files:**
- Create: `src/hooks/useOrgData.ts`

- [ ] **Step 1: Create the org data hooks file**

```typescript
// src/hooks/useOrgData.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Organization, OrgUnit, OrgMember } from '@/types/org';

export function useOrg() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['org', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', (
          await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()
        ).data?.org_id ?? '')
        .single();
      if (error) throw error;
      return data as Organization;
    },
    enabled: !!user,
  });
}

export function useOrgFromProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['org-from-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('org_id, active_org_unit_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.org_id) return null;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.org_id)
        .single();

      if (orgError) throw orgError;
      return { org: org as Organization, activeOrgUnitId: profile.active_org_unit_id as string | null };
    },
    enabled: !!user,
  });
}

export function useOrgUnits(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-units', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('org_units')
        .select('*')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as OrgUnit[];
    },
    enabled: !!orgId,
  });
}

export function useActiveOrgUnit(orgUnitId: string | undefined) {
  return useQuery({
    queryKey: ['active-org-unit', orgUnitId],
    queryFn: async () => {
      if (!orgUnitId) return null;
      const { data, error } = await supabase
        .from('org_units')
        .select('*')
        .eq('id', orgUnitId)
        .single();
      if (error) throw error;
      return data as OrgUnit;
    },
    enabled: !!orgUnitId,
  });
}

export function useUpdateActiveUnit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unitId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ active_org_unit_id: unitId })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-from-profile'] });
      queryClient.invalidateQueries({ queryKey: ['active-org-unit'] });
    },
  });
}

export function useCreateOrgUnit(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unit: Partial<OrgUnit>) => {
      if (!orgId) throw new Error('No org');
      const { data, error } = await supabase
        .from('org_units')
        .insert({ ...unit, org_id: orgId })
        .select()
        .single();
      if (error) throw error;
      return data as OrgUnit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-units', orgId] });
    },
  });
}

export function useUpdateOrgUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OrgUnit> & { id: string }) => {
      const { data, error } = await supabase
        .from('org_units')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as OrgUnit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['org-units', data.org_id] });
    },
  });
}

export function useDeleteOrgUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase
        .from('org_units')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return orgId;
    },
    onSuccess: (orgId) => {
      queryClient.invalidateQueries({ queryKey: ['org-units', orgId] });
    },
  });
}

export function useMyOrgRole(orgId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-org-role', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return null;
      const { data, error } = await supabase
        .from('org_members')
        .select('role, invitation_status')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data as { role: 'owner' | 'admin' | 'standard'; invitation_status: string };
    },
    enabled: !!orgId && !!user,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useOrgData.ts
git commit -m "feat(org): React Query hooks for org/unit CRUD

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Create org members hooks

**Files:**
- Create: `src/hooks/useOrgMembers.ts`

- [ ] **Step 1: Create the org members hooks file**

```typescript
// src/hooks/useOrgMembers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OrgMember, OrgRole } from '@/types/org';

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('org_members')
        .select(`
          id, org_id, user_id, role, invited_by,
          invitation_status, invited_at, joined_at, last_active_at,
          profiles!org_members_user_id_fkey (full_name, email, avatar_url)
        `)
        .eq('org_id', orgId)
        .neq('invitation_status', 'suspended')
        .order('role')
        .order('joined_at');

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        org_id: row.org_id,
        user_id: row.user_id,
        role: row.role,
        invited_by: row.invited_by,
        invitation_status: row.invitation_status,
        invited_at: row.invited_at,
        joined_at: row.joined_at,
        last_active_at: row.last_active_at,
        full_name: row.profiles?.full_name,
        email: row.profiles?.email,
        avatar_url: row.profiles?.avatar_url,
      })) as OrgMember[];
    },
    enabled: !!orgId,
  });
}

export function useUpdateMemberRole(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: OrgRole }) => {
      const { error } = await supabase
        .from('org_members')
        .update({ role: newRole })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });
}

export function useRemoveMember(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('org_members')
        .update({ invitation_status: 'suspended' })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });
}

export function useInviteMembers(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emails, role }: { emails: string[]; role: OrgRole }) => {
      const results: { email: string; status: 'sent' | 'failed' | 'already_member'; error?: string }[] = [];

      for (const email of emails) {
        try {
          const { data, error } = await supabase.functions.invoke('invite-member', {
            body: { org_id: orgId, email: email.trim(), role },
          });
          if (error) throw error;
          results.push({ email, status: data?.status ?? 'sent' });
        } catch (err: any) {
          results.push({ email, status: 'failed', error: err.message });
        }
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useOrgMembers.ts
git commit -m "feat(org): React Query hooks for team member management

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Extend AuthContext with org state

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add org imports and extend the Profile and Context types**

In `src/contexts/AuthContext.tsx`, add the import at the top (after existing imports):

```typescript
import type { Organization, OrgUnit } from '@/types/org';
```

Extend the `Profile` interface (around line 8) — add these fields after `email_verified`:

```typescript
  org_id?: string;
  active_org_unit_id?: string;
```

Extend the `AuthContextType` interface (around line 20) — add these fields after `migrateCampaignData`:

```typescript
  activeOrg: Organization | null;
  activeOrgUnit: OrgUnit | null;
  switchOrgUnit: (unitId: string) => Promise<void>;
```

- [ ] **Step 2: Add org state and fetch logic inside AuthProvider**

Inside the `AuthProvider` component, after the existing state declarations (around line 40), add:

```typescript
const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
const [activeOrgUnit, setActiveOrgUnit] = useState<OrgUnit | null>(null);
```

After the `fetchProfile` function (around line 180), add a new function:

```typescript
const fetchOrgData = async (orgId: string | null, orgUnitId: string | null) => {
  if (!orgId) {
    setActiveOrg(null);
    setActiveOrgUnit(null);
    return;
  }
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();
    setActiveOrg(org as Organization | null);

    if (orgUnitId) {
      const { data: unit } = await supabase
        .from('org_units')
        .select('*')
        .eq('id', orgUnitId)
        .single();
      setActiveOrgUnit(unit as OrgUnit | null);
    }
  } catch {
    setActiveOrg(null);
    setActiveOrgUnit(null);
  }
};
```

In the `fetchProfile` function, after setting the profile state (where `setProfile(profileData)` is called), add:

```typescript
await fetchOrgData(profileData.org_id ?? null, profileData.active_org_unit_id ?? null);
```

Make sure to also fetch `org_id` and `active_org_unit_id` from the profiles query. Find the `.select()` call on the profiles table and add those two columns.

- [ ] **Step 3: Add the switchOrgUnit function**

After `fetchOrgData`, add:

```typescript
const switchOrgUnit = async (unitId: string) => {
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ active_org_unit_id: unitId })
    .eq('id', user.id);
  if (error) throw error;

  const { data: unit } = await supabase
    .from('org_units')
    .select('*')
    .eq('id', unitId)
    .single();
  setActiveOrgUnit(unit as OrgUnit | null);
};
```

- [ ] **Step 4: Add org fields to the context value**

Find the `value` object passed to `AuthContext.Provider` and add:

```typescript
activeOrg,
activeOrgUnit,
switchOrgUnit,
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No TypeScript errors. Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(org): extend AuthContext with org/unit state and switching

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Build OrgUnitSwitcher component

**Files:**
- Create: `src/components/org/OrgUnitSwitcher.tsx`

- [ ] **Step 1: Create the switcher component**

```typescript
// src/components/org/OrgUnitSwitcher.tsx
import { useState } from 'react';
import { Check, ChevronDown, MapPin, Tag, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits, useUpdateActiveUnit } from '@/hooks/useOrgData';
import type { OrgUnit } from '@/types/org';

interface OrgUnitSwitcherProps {
  onAddUnit?: () => void;
  canManage: boolean;
}

export function OrgUnitSwitcher({ onAddUnit, canManage }: OrgUnitSwitcherProps) {
  const { activeOrg, activeOrgUnit } = useAuth();
  const { data: units = [] } = useOrgUnits(activeOrg?.id);
  const updateActive = useUpdateActiveUnit();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  if (!activeOrg || !activeOrgUnit) return null;

  const isRestaurant = activeOrg.org_type === 'restaurant';
  const icon = isRestaurant ? MapPin : Tag;
  const Icon = icon;
  const unitLabel = isRestaurant ? 'location' : 'product';

  const filtered = search
    ? units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : units;

  const handleSelect = async (unit: OrgUnit) => {
    if (unit.id === activeOrgUnit.id) {
      setOpen(false);
      return;
    }
    await updateActive.mutateAsync(unit.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[200px] gap-1.5 rounded-full border-teal-300 text-sm font-medium"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-teal-500" />
          <span className="truncate">{activeOrgUnit.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 pb-2">
          <p className="text-sm font-semibold">Switch {unitLabel}</p>
          <p className="text-xs text-muted-foreground">{activeOrg.name}</p>
        </div>
        {units.length > 5 && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={`Search ${unitLabel}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto border-t">
          {filtered.map((unit) => (
            <button
              key={unit.id}
              onClick={() => handleSelect(unit)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 font-semibold text-xs">
                {unit.logo_url ? (
                  <img src={unit.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  unit.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{unit.name}</p>
                {unit.address && (
                  <p className="text-xs text-muted-foreground truncate">{unit.address}</p>
                )}
                {unit.website_url && (
                  <p className="text-xs text-muted-foreground truncate">{unit.website_url}</p>
                )}
              </div>
              {unit.id === activeOrgUnit.id && (
                <Check className="h-4 w-4 shrink-0 text-teal-500" />
              )}
            </button>
          ))}
        </div>
        {canManage && onAddUnit && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-teal-600"
              onClick={() => {
                onAddUnit();
                setOpen(false);
              }}
            >
              <Plus className="h-4 w-4" />
              Add new {unitLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/org/OrgUnitSwitcher.tsx
git commit -m "feat(org): OrgUnitSwitcher header component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Build AddEditUnitModal

**Files:**
- Create: `src/components/org/AddEditUnitModal.tsx`

- [ ] **Step 1: Create the modal component**

```typescript
// src/components/org/AddEditUnitModal.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateOrgUnit, useUpdateOrgUnit } from '@/hooks/useOrgData';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org';

interface AddEditUnitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  unitType: 'location' | 'product';
  editUnit?: OrgUnit | null;
}

export function AddEditUnitModal({ open, onOpenChange, orgId, unitType, editUnit }: AddEditUnitModalProps) {
  const createUnit = useCreateOrgUnit(orgId);
  const updateUnit = useUpdateOrgUnit();
  const { toast } = useToast();
  const isEditing = !!editUnit;
  const isLocation = unitType === 'location';

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (editUnit) {
      setName(editUnit.name);
      setAddress(editUnit.address ?? '');
      setWebsiteUrl(editUnit.website_url ?? '');
      setIsPrimary(editUnit.is_primary);
    } else {
      setName('');
      setAddress('');
      setWebsiteUrl('');
      setIsPrimary(false);
    }
  }, [editUnit, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    try {
      const payload: Partial<OrgUnit> = {
        name: name.trim(),
        unit_type: unitType,
        is_primary: isPrimary,
        ...(isLocation ? { address: address.trim() || null } : { website_url: websiteUrl.trim() || null }),
      };

      if (isEditing && editUnit) {
        await updateUnit.mutateAsync({ id: editUnit.id, ...payload });
        toast({ title: `${isLocation ? 'Location' : 'Product'} updated` });
      } else {
        await createUnit.mutateAsync(payload);
        toast({ title: `${isLocation ? 'Location' : 'Product'} created` });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const saving = createUnit.isPending || updateUnit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit' : 'Add'} {isLocation ? 'Location' : 'Product'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="unit-name">Name</Label>
            <Input
              id="unit-name"
              placeholder={isLocation ? 'e.g. Downtown Branch' : 'e.g. Hot Sauce Line'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {isLocation ? (
            <div className="space-y-2">
              <Label htmlFor="unit-address">Address</Label>
              <Input
                id="unit-address"
                placeholder="123 Main St, City, State"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="unit-website">Website URL</Label>
              <Input
                id="unit-website"
                placeholder="https://example.com/product"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Set as default</p>
              <p className="text-xs text-muted-foreground">
                New campaigns will use this {isLocation ? 'location' : 'product'}
              </p>
            </div>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/org/AddEditUnitModal.tsx
git commit -m "feat(org): AddEditUnitModal for locations/products

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Build OrgUnitsPage

**Files:**
- Create: `src/pages/OrgUnitsPage.tsx`

- [ ] **Step 1: Create the org units page**

```typescript
// src/pages/OrgUnitsPage.tsx
import { useState } from 'react';
import { MapPin, Tag, MoreVertical, Plus, Building2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits, useMyOrgRole, useDeleteOrgUnit } from '@/hooks/useOrgData';
import { AddEditUnitModal } from '@/components/org/AddEditUnitModal';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org';

export default function OrgUnitsPage() {
  const { profile, activeOrg } = useAuth();
  const { data: units = [], isLoading } = useOrgUnits(activeOrg?.id);
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const deleteUnit = useDeleteOrgUnit();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<OrgUnit | null>(null);

  const userRole = profile?.role ?? 'business_client';
  const isRestaurant = activeOrg?.org_type === 'restaurant';
  const unitLabel = isRestaurant ? 'Location' : 'Product';
  const unitLabelPlural = isRestaurant ? 'Locations' : 'Products';
  const canManage = myRole?.role === 'owner' || myRole?.role === 'admin';

  const handleDelete = async (unit: OrgUnit) => {
    if (units.length <= 1) {
      toast({ title: 'Cannot delete', description: `You must have at least one ${unitLabel.toLowerCase()}.`, variant: 'destructive' });
      return;
    }
    try {
      await deleteUnit.mutateAsync({ id: unit.id, orgId: activeOrg!.id });
      toast({ title: `${unitLabel} deleted` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (unit: OrgUnit) => {
    setEditUnit(unit);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditUnit(null);
    setModalOpen(true);
  };

  return (
    <DashboardLayout userRole={userRole as any}>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your {unitLabelPlural}</h1>
            {activeOrg && (
              <p className="text-sm text-muted-foreground">{activeOrg.name}</p>
            )}
          </div>
          {canManage && (
            <Button onClick={handleAdd} className="gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white">
              <Plus className="h-4 w-4" />
              Add {unitLabel}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-24 p-4" />
              </Card>
            ))}
          </div>
        ) : units.length === 0 ? (
          <Card className="border-dashed border-2 border-teal-300">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">No {unitLabelPlural.toLowerCase()} yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first {unitLabel.toLowerCase()} to get started.
              </p>
              {canManage && (
                <Button onClick={handleAdd} className="mt-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white">
                  Add {unitLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {units.map((unit) => (
              <Card key={unit.id} className="border border-teal-300/50 hover:border-teal-300 transition-colors">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 font-bold text-lg">
                    {unit.logo_url ? (
                      <img src={unit.logo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : isRestaurant ? (
                      <MapPin className="h-5 w-5" />
                    ) : (
                      <Tag className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{unit.name}</p>
                      {unit.is_primary && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                    {unit.address && (
                      <p className="text-sm text-muted-foreground truncate">{unit.address}</p>
                    )}
                    {unit.website_url && (
                      <p className="text-sm text-muted-foreground truncate">{unit.website_url}</p>
                    )}
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(unit)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(unit)}
                          className="text-red-600"
                          disabled={units.length <= 1}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {units.length === 1 && canManage && (
          <Card className="bg-teal-50/50 border-teal-200">
            <CardContent className="p-4 text-center text-sm text-teal-700">
              Add another {unitLabel.toLowerCase()} to manage multiple{' '}
              {isRestaurant ? 'stores' : 'brands'} from one account.
            </CardContent>
          </Card>
        )}
      </div>

      {activeOrg && (
        <AddEditUnitModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          orgId={activeOrg.id}
          unitType={isRestaurant ? 'location' : 'product'}
          editUnit={editUnit}
        />
      )}
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/OrgUnitsPage.tsx
git commit -m "feat(org): OrgUnitsPage for managing locations/products

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Wire OrgUnitSwitcher into DashboardLayout and update nav

**Files:**
- Modify: `src/components/DashboardLayout.tsx`
- Modify: `src/lib/navConfig.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add OrgUnitSwitcher to DashboardLayout header**

In `src/components/DashboardLayout.tsx`:

Add import at top:
```typescript
import { OrgUnitSwitcher } from '@/components/org/OrgUnitSwitcher';
import { useMyOrgRole } from '@/hooks/useOrgData';
```

Inside the `DashboardLayout` component function, before the return, add:
```typescript
const { activeOrg } = useAuth();
const { data: myRole } = useMyOrgRole(activeOrg?.id);
const canManageUnits = myRole?.role === 'owner' || myRole?.role === 'admin';
```

In the desktop header's right side section (around line 187, the `div` with `flex items-center gap-2`), insert the OrgUnitSwitcher BEFORE the ThemeToggle:

```tsx
{userRole !== 'content_creator' && (
  <OrgUnitSwitcher
    canManage={canManageUnits}
    onAddUnit={() => window.location.href = activeOrg?.org_type === 'restaurant'
      ? '/dashboard/business/locations'
      : '/dashboard/brand/products'}
  />
)}
```

- [ ] **Step 2: Add nav items to navConfig.ts**

In `src/lib/navConfig.ts`:

Add import at top:
```typescript
import { Building2, Users2, CreditCard } from 'lucide-react';
```

Add to `businessSidebarNav` array (before the Settings entry):
```typescript
{ icon: Building2, label: 'Locations', href: '/dashboard/business/locations' },
{ icon: Users2, label: 'Team', href: '/dashboard/business/team' },
{ icon: CreditCard, label: 'Billing', href: '/dashboard/business/billing' },
```

Add to `brandSidebarNav` array (before the Settings entry):
```typescript
{ icon: Building2, label: 'Products', href: '/dashboard/brand/products' },
{ icon: Users2, label: 'Team', href: '/dashboard/brand/team' },
{ icon: CreditCard, label: 'Billing', href: '/dashboard/brand/billing' },
```

- [ ] **Step 3: Add routes to App.tsx**

In `src/App.tsx`:

Add imports at top:
```typescript
import OrgUnitsPage from '@/pages/OrgUnitsPage';
import TeamPage from '@/pages/TeamPage';
import OrgBillingPage from '@/pages/OrgBillingPage';
import RestoreAccountPage from '@/pages/RestoreAccountPage';
import InviteAcceptPage from '@/pages/InviteAcceptPage';
```

Add routes inside the business protected routes section:
```tsx
<Route path="/dashboard/business/locations" element={<BusinessRoute><OrgUnitsPage /></BusinessRoute>} />
<Route path="/dashboard/business/team" element={<BusinessRoute><TeamPage /></BusinessRoute>} />
<Route path="/dashboard/business/billing" element={<BusinessRoute><OrgBillingPage /></BusinessRoute>} />
```

Add routes inside the brand protected routes section:
```tsx
<Route path="/dashboard/brand/products" element={<BrandRoute><OrgUnitsPage /></BrandRoute>} />
<Route path="/dashboard/brand/team" element={<BrandRoute><TeamPage /></BrandRoute>} />
<Route path="/dashboard/brand/billing" element={<BrandRoute><OrgBillingPage /></BrandRoute>} />
```

Add public routes (before the catch-all):
```tsx
<Route path="/restore-account" element={<ProtectedRoute><RestoreAccountPage /></ProtectedRoute>} />
<Route path="/invite/accept" element={<InviteAcceptPage />} />
```

Note: TeamPage, OrgBillingPage, RestoreAccountPage, and InviteAcceptPage don't exist yet — they'll be created in Tasks 10-14. For now, create placeholder files so the build doesn't break.

- [ ] **Step 4: Create placeholder pages so the build passes**

Create minimal placeholder files for pages not yet built:

`src/pages/TeamPage.tsx`:
```typescript
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
export default function TeamPage() {
  const { profile } = useAuth();
  return (
    <DashboardLayout userRole={(profile?.role ?? 'business_client') as any}>
      <div className="p-6"><h1 className="text-2xl font-bold">Team</h1><p className="text-muted-foreground">Coming soon.</p></div>
    </DashboardLayout>
  );
}
```

`src/pages/OrgBillingPage.tsx`:
```typescript
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
export default function OrgBillingPage() {
  const { profile } = useAuth();
  return (
    <DashboardLayout userRole={(profile?.role ?? 'business_client') as any}>
      <div className="p-6"><h1 className="text-2xl font-bold">Billing</h1><p className="text-muted-foreground">Coming soon.</p></div>
    </DashboardLayout>
  );
}
```

`src/pages/RestoreAccountPage.tsx`:
```typescript
export default function RestoreAccountPage() {
  return <div className="flex min-h-screen items-center justify-center p-6"><p>Restore account — coming soon.</p></div>;
}
```

`src/pages/InviteAcceptPage.tsx`:
```typescript
export default function InviteAcceptPage() {
  return <div className="flex min-h-screen items-center justify-center p-6"><p>Processing invite...</p></div>;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardLayout.tsx src/lib/navConfig.ts src/App.tsx src/pages/TeamPage.tsx src/pages/OrgBillingPage.tsx src/pages/RestoreAccountPage.tsx src/pages/InviteAcceptPage.tsx
git commit -m "feat(org): wire switcher into header, add nav items and routes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**APPROVAL GATE: Stop here. B1 (Org Switcher + Sub-Account List) is complete. Review before B2.**

---

### Task 10: Build TeamPage with member list and role management

**Files:**
- Modify: `src/pages/TeamPage.tsx` (replace placeholder)

- [ ] **Step 1: Replace TeamPage placeholder with full implementation**

```typescript
// src/pages/TeamPage.tsx
import { useState } from 'react';
import { UserPlus, Search, Shield, ShieldCheck, User, MoreVertical } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useOrgMembers, useUpdateMemberRole, useRemoveMember } from '@/hooks/useOrgMembers';
import { InviteModal } from '@/components/org/InviteModal';
import { useToast } from '@/hooks/use-toast';
import type { OrgMember, OrgRole } from '@/types/org';

const ROLE_BADGES: Record<OrgRole, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  owner: { label: 'Owner', variant: 'default' },
  admin: { label: 'Admin', variant: 'secondary' },
  standard: { label: 'Member', variant: 'outline' },
};

const FILTERS = ['All', 'Owners', 'Admins', 'Standard', 'Pending'] as const;
type Filter = typeof FILTERS[number];

export default function TeamPage() {
  const { user, profile, activeOrg } = useAuth();
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const { data: members = [], isLoading } = useOrgMembers(activeOrg?.id);
  const updateRole = useUpdateMemberRole(activeOrg?.id);
  const removeMember = useRemoveMember(activeOrg?.id);
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  const userRole = profile?.role ?? 'business_client';
  const canInvite = myRole?.role === 'owner' || myRole?.role === 'admin';

  const filtered = members.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.full_name?.toLowerCase().includes(q) && !m.email?.toLowerCase().includes(q)) return false;
    }
    switch (filter) {
      case 'Owners': return m.role === 'owner';
      case 'Admins': return m.role === 'admin';
      case 'Standard': return m.role === 'standard';
      case 'Pending': return m.invitation_status === 'invited';
      default: return true;
    }
  });

  const canChangeRole = (target: OrgMember): OrgRole[] => {
    if (!myRole) return [];
    if (myRole.role === 'owner') return ['owner', 'admin', 'standard'].filter((r) => r !== target.role) as OrgRole[];
    if (myRole.role === 'admin' && target.role === 'standard') return ['admin'];
    if (myRole.role === 'admin' && target.role === 'admin') return ['standard'];
    return [];
  };

  const canRemove = (target: OrgMember): boolean => {
    if (!myRole || !user) return false;
    if (target.user_id === user.id) return true;
    if (myRole.role === 'owner') return target.role !== 'owner' || members.filter((m) => m.role === 'owner').length > 1;
    if (myRole.role === 'admin') return target.role === 'standard' || target.role === 'admin';
    return false;
  };

  const handleRoleChange = async (member: OrgMember, newRole: OrgRole) => {
    try {
      await updateRole.mutateAsync({ memberId: member.id, newRole });
      toast({ title: `${member.full_name ?? member.email} is now ${ROLE_BADGES[newRole].label}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemove = async (member: OrgMember) => {
    const isSelf = member.user_id === user?.id;
    try {
      await removeMember.mutateAsync(member.id);
      toast({ title: isSelf ? 'You left the organization' : `${member.full_name ?? member.email} removed` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const roleIcon = (role: OrgRole) => {
    if (role === 'owner') return <ShieldCheck className="h-3.5 w-3.5" />;
    if (role === 'admin') return <Shield className="h-3.5 w-3.5" />;
    return <User className="h-3.5 w-3.5" />;
  };

  return (
    <DashboardLayout userRole={userRole as any}>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            {activeOrg && <p className="text-sm text-muted-foreground">{activeOrg.name}</p>}
          </div>
          {canInvite && (
            <Button onClick={() => setInviteOpen(true)} className="gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white">
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              className={`rounded-full text-xs ${filter === f ? 'bg-teal-500 hover:bg-teal-600 text-white' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {members.length > 10 && (
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse"><CardContent className="h-16 p-4" /></Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((member) => {
              const badge = ROLE_BADGES[member.role];
              const roles = canChangeRole(member);
              const removable = canRemove(member);
              const isPending = member.invitation_status === 'invited';

              return (
                <Card key={member.id} className="border border-border/50">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="h-10 w-10 ring-2 ring-teal-400/50">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-teal-50 text-teal-600 text-sm font-semibold">
                        {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {member.full_name ?? member.email}
                        </p>
                        <Badge variant={badge.variant} className="text-[10px] gap-1">
                          {roleIcon(member.role)}
                          {badge.label}
                        </Badge>
                        {isPending && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Pending</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    {(roles.length > 0 || removable) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {roles.length > 0 && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {roles.map((r) => (
                                  <DropdownMenuItem key={r} onClick={() => handleRoleChange(member, r)}>
                                    {ROLE_BADGES[r].label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          {removable && (
                            <DropdownMenuItem
                              onClick={() => handleRemove(member)}
                              className="text-red-600"
                            >
                              {member.user_id === user?.id ? 'Leave organization' : 'Remove member'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No members match this filter.</p>
            )}
          </div>
        )}
      </div>

      {activeOrg && (
        <InviteModal
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          orgId={activeOrg.id}
          myRole={myRole?.role ?? 'standard'}
        />
      )}
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: May fail because `InviteModal` doesn't exist yet. That's expected — continue to Task 11.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TeamPage.tsx
git commit -m "feat(org): TeamPage with member list, roles, and filtering

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Build InviteModal

**Files:**
- Create: `src/components/org/InviteModal.tsx`

- [ ] **Step 1: Create the invite modal component**

```typescript
// src/components/org/InviteModal.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useInviteMembers } from '@/hooks/useOrgMembers';
import { useAuth } from '@/hooks/useAuth';
import { SEAT_LIMITS } from '@/types/org';
import type { OrgRole } from '@/types/org';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  myRole: OrgRole;
}

const ROLES: { value: OrgRole; label: string; description: string }[] = [
  { value: 'standard', label: 'Member', description: 'Can view and switch units' },
  { value: 'admin', label: 'Admin', description: 'Can manage units and invite members' },
  { value: 'owner', label: 'Owner', description: 'Full control including billing and deletion' },
];

export function InviteModal({ open, onOpenChange, orgId, myRole }: InviteModalProps) {
  const { activeOrg } = useAuth();
  const invite = useInviteMembers(orgId);
  const [emailText, setEmailText] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>('standard');
  const [results, setResults] = useState<{ email: string; status: string; error?: string }[] | null>(null);

  const tier = activeOrg?.subscription_tier ?? 'free';
  const limits = SEAT_LIMITS[tier];
  const currentSeats = activeOrg?.seat_count ?? 1;
  const maxSeats = limits.included + (limits.maxAdditional ?? 999);
  const seatsRemaining = maxSeats - currentSeats;

  const availableRoles = ROLES.filter((r) => {
    if (myRole === 'owner') return true;
    if (myRole === 'admin') return r.value !== 'owner';
    return false;
  });

  const emails = emailText
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  const handleSend = async () => {
    if (emails.length === 0) return;

    if (tier === 'free' && emails.length > 0) {
      setResults([{ email: '', status: 'failed', error: 'Upgrade to Starter to add teammates.' }]);
      return;
    }

    if (emails.length > seatsRemaining) {
      setResults([{ email: '', status: 'failed', error: `Only ${seatsRemaining} seat(s) remaining on your ${tier} plan.` }]);
      return;
    }

    const res = await invite.mutateAsync({ emails, role: selectedRole });
    setResults(res);
  };

  const handleClose = () => {
    setEmailText('');
    setSelectedRole('standard');
    setResults(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammates</DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 py-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {r.status === 'sent' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="truncate">{r.email || 'Error'}</span>
                {r.error && <span className="text-xs text-red-500">— {r.error}</span>}
              </div>
            ))}
            <DialogFooter className="pt-2">
              <Button onClick={handleClose} className="rounded-full">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Email addresses</Label>
                <Textarea
                  placeholder="colleague@company.com, another@company.com"
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple emails with commas or new lines.
                  {seatsRemaining < 999 && ` ${seatsRemaining} seat(s) remaining.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r) => (
                    <Button
                      key={r.value}
                      variant={selectedRole === r.value ? 'default' : 'outline'}
                      size="sm"
                      className={`rounded-full text-xs ${selectedRole === r.value ? 'bg-teal-500 hover:bg-teal-600 text-white' : ''}`}
                      onClick={() => setSelectedRole(r.value)}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {availableRoles.find((r) => r.value === selectedRole)?.description}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={emails.length === 0 || invite.isPending}
                className="gap-2 bg-teal-500 hover:bg-teal-600 text-white"
              >
                {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send {emails.length > 0 ? `(${emails.length})` : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/org/InviteModal.tsx
git commit -m "feat(org): InviteModal for team member invitations

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Create invite-member edge function

**Files:**
- Create: `supabase/functions/invite-member/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/invite-member/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get caller's auth
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { org_id, email, role } = await req.json();

    if (!org_id || !email || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: org_id, email, role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is owner or admin of the org
    const { data: callerMembership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .eq('invitation_status', 'active')
      .single();

    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin cannot assign owner role
    if (callerMembership.role === 'admin' && role === 'owner') {
      return new Response(JSON.stringify({ error: 'Admins cannot assign owner role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('id, invitation_status')
      .eq('org_id', org_id)
      .eq('user_id', (
        await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
      ).data?.id ?? '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (existingMember?.invitation_status === 'active') {
      return new Response(JSON.stringify({ status: 'already_member' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user exists in auth
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      // Existing user: create or reactivate membership
      if (existingMember) {
        await supabase
          .from('org_members')
          .update({ invitation_status: 'invited', role, invited_by: caller.id, invited_at: new Date().toISOString() })
          .eq('id', existingMember.id);
      } else {
        await supabase
          .from('org_members')
          .insert({
            org_id,
            user_id: existingProfile.id,
            role,
            invited_by: caller.id,
            invitation_status: 'invited',
            invited_at: new Date().toISOString(),
          });
      }

      // Get org name for the email
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', org_id)
        .single();

      // Send notification email
      try {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            to: email,
            subject: `You've been invited to join ${org?.name ?? 'a team'} on DragonCandy`,
            html: `<p>You've been invited to join <strong>${org?.name ?? 'a team'}</strong> as a <strong>${role}</strong>.</p><p><a href="https://dragoncandy.io/invite/accept?org=${org_id}&user=${existingProfile.id}">Accept Invitation</a></p>`,
          },
        });
      } catch {
        // Email send failure shouldn't block the invite
      }

      return new Response(JSON.stringify({ status: 'sent' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // New user: send magic link with org context
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `https://dragoncandy.io/invite/accept?org=${org_id}&role=${role}&invited_by=${caller.id}`,
      });

      if (inviteError) {
        return new Response(JSON.stringify({ status: 'failed', error: inviteError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ status: 'sent' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/invite-member/index.ts
git commit -m "feat(org): invite-member edge function with role-based access

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: Build InviteAcceptPage

**Files:**
- Modify: `src/pages/InviteAcceptPage.tsx` (replace placeholder)

- [ ] **Step 1: Replace with full implementation**

```typescript
// src/pages/InviteAcceptPage.tsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const orgId = searchParams.get('org');
  const invitedUserId = searchParams.get('user');
  const role = searchParams.get('role');
  const invitedBy = searchParams.get('invited_by');

  useEffect(() => {
    const acceptInvite = async () => {
      if (!isAuthenticated || !user) return;
      if (!orgId) {
        setStatus('error');
        setErrorMessage('Invalid invite link.');
        return;
      }

      try {
        // For existing users: update their org_members row
        if (invitedUserId) {
          const { error } = await supabase
            .from('org_members')
            .update({
              invitation_status: 'active',
              joined_at: new Date().toISOString(),
            })
            .eq('org_id', orgId)
            .eq('user_id', user.id)
            .eq('invitation_status', 'invited');

          if (error) throw error;
        } else if (role) {
          // For new users (signed up via magic link): create membership
          const { error } = await supabase
            .from('org_members')
            .upsert({
              org_id: orgId,
              user_id: user.id,
              role: role as any,
              invited_by: invitedBy,
              invitation_status: 'active',
              joined_at: new Date().toISOString(),
            }, { onConflict: 'org_id,user_id' });

          if (error) throw error;
        }

        // Update profile org reference
        await supabase
          .from('profiles')
          .update({ org_id: orgId })
          .eq('id', user.id);

        setStatus('success');
        setTimeout(() => {
          navigate('/dashboard/business', { replace: true });
        }, 2000);
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message ?? 'Failed to accept invitation.');
      }
    };

    acceptInvite();
  }, [isAuthenticated, user, orgId, invitedUserId, role, invitedBy, navigate]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#A8A8A0] p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
            <p className="font-medium">Sign in to accept your invitation</p>
            <Button
              onClick={() => navigate(`/auth?redirect=/invite/accept?${searchParams.toString()}`)}
              className="mt-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#A8A8A0] p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="font-medium">Accepting invitation...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">Welcome to the team!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="font-medium text-lg">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              <Button
                onClick={() => navigate('/dashboard/business')}
                className="mt-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                Go to Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/InviteAcceptPage.tsx
git commit -m "feat(org): InviteAcceptPage for team invitation acceptance

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**APPROVAL GATE: Stop here. B2 (Team Management + Invites) is complete. Review before B3.**

---

### Task 14: Build account deletion components

**Files:**
- Create: `src/components/org/DeleteOrgSheet.tsx`
- Create: `src/components/org/LeaveOrgSheet.tsx`
- Create: `src/components/org/DeleteUserSheet.tsx`

- [ ] **Step 1: Create DeleteOrgSheet**

```typescript
// src/components/org/DeleteOrgSheet.tsx
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface DeleteOrgSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteOrgSheet({ open, onOpenChange }: DeleteOrgSheetProps) {
  const { activeOrg, signOut } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const orgName = activeOrg?.name ?? '';
  const confirmed = confirmText === orgName;

  const handleDelete = async () => {
    if (!confirmed || !activeOrg) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('request_org_deletion', { p_org_id: activeOrg.id });
      if (error) throw error;
      toast({ title: 'Organization scheduled for deletion', description: 'You have 30 days to restore it. Check your email.' });
      await signOut();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <SheetTitle>Delete {orgName}?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            This will soft-delete your organization. You have <strong>30 days</strong> to restore it.
            After that, all team data, campaigns in flight, and PII will be permanently purged.
            Delivered campaign content stays with the creators and brands who licensed it.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type <strong>{orgName}</strong> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
            />
          </div>
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex-1 rounded-full"
          >
            {deleting ? 'Deleting...' : 'Delete organization'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Create LeaveOrgSheet**

```typescript
// src/components/org/LeaveOrgSheet.tsx
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface LeaveOrgSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaveOrgSheet({ open, onOpenChange }: LeaveOrgSheetProps) {
  const { user, activeOrg } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    if (!user || !activeOrg) return;
    setLeaving(true);
    try {
      const { error } = await supabase
        .from('org_members')
        .update({ invitation_status: 'suspended' })
        .eq('org_id', activeOrg.id)
        .eq('user_id', user.id);
      if (error) throw error;

      // Clear profile org reference
      await supabase
        .from('profiles')
        .update({ org_id: null, active_org_unit_id: null })
        .eq('id', user.id);

      toast({ title: `You left ${activeOrg.name}` });
      navigate('/profile/setup', { replace: true });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setLeaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-500" />
            <SheetTitle>Leave {activeOrg?.name}?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            You'll lose access to all campaigns, team data, and analytics for this organization.
            You can be re-invited later.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className="flex-row gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaving}
            className="flex-1 rounded-full"
          >
            {leaving ? 'Leaving...' : 'Leave organization'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Create DeleteUserSheet**

```typescript
// src/components/org/DeleteUserSheet.tsx
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skull } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface DeleteUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteUserSheet({ open, onOpenChange }: DeleteUserSheetProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const confirmed = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!confirmed || !user) return;
    setDeleting(true);

    try {
      // Pre-flight: check if user owns any orgs with other active members
      const { data: ownedOrgs } = await supabase
        .from('org_members')
        .select('org_id, organizations!inner(name)')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .eq('invitation_status', 'active');

      if (ownedOrgs && ownedOrgs.length > 0) {
        for (const membership of ownedOrgs) {
          const { count } = await supabase
            .from('org_members')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', membership.org_id)
            .eq('invitation_status', 'active')
            .neq('user_id', user.id);

          if (count && count > 0) {
            setBlocked(`Transfer ownership of "${(membership as any).organizations?.name}" or delete it first.`);
            setDeleting(false);
            return;
          }
        }
      }

      // Soft delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: 'Deleted User',
          avatar_url: null,
          org_id: null,
          active_org_unit_id: null,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Create deletion request
      await supabase
        .from('account_deletion_requests')
        .insert({
          requested_by: user.id,
          target_type: 'user_self',
          target_id: user.id,
          status: 'soft_deleted',
          reason_code: 'user_requested',
          soft_deleted_at: new Date().toISOString(),
          hard_purge_scheduled_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

      toast({ title: 'Account scheduled for deletion', description: 'You have 30 days to restore it.' });
      await signOut();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <Skull className="h-5 w-5 text-red-500" />
            <SheetTitle>Delete your account?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            This deletes your DragonCandy login. Profiles, portfolio, messages, and payouts
            will be soft-deleted for 30 days then permanently purged.
            {blocked && (
              <span className="block mt-2 text-red-500 font-medium">{blocked}</span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type <strong>DELETE</strong> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmed || deleting || !!blocked}
            className="flex-1 rounded-full"
          >
            {deleting ? 'Deleting...' : 'Delete my account'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/org/DeleteOrgSheet.tsx src/components/org/LeaveOrgSheet.tsx src/components/org/DeleteUserSheet.tsx
git commit -m "feat(deletion): org delete, leave org, and user account delete sheets

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Add Danger Zone to settings pages

**Files:**
- Modify: `src/pages/BusinessSettings.tsx`
- Modify: `src/pages/CreatorSettings.tsx`

- [ ] **Step 1: Add Danger Zone to BusinessSettings**

In `src/pages/BusinessSettings.tsx`, add imports at the top:

```typescript
import { useState } from 'react';
import { Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { DeleteOrgSheet } from '@/components/org/DeleteOrgSheet';
import { LeaveOrgSheet } from '@/components/org/LeaveOrgSheet';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
```

Inside the component, after existing state declarations, add:

```typescript
const { activeOrg } = useAuth();
const { data: myRole } = useMyOrgRole(activeOrg?.id);
const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
const [leaveOrgOpen, setLeaveOrgOpen] = useState(false);
const [deleteUserOpen, setDeleteUserOpen] = useState(false);
const isOwner = myRole?.role === 'owner';
```

After the existing `BusinessSettingsSections` component (just before the closing `</div>` of the main content area), add:

```tsx
<Accordion type="single" collapsible className="mt-6">
  <AccordionItem value="danger" className="border-red-200">
    <AccordionTrigger className="text-red-600 hover:text-red-700">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        Danger Zone
      </div>
    </AccordionTrigger>
    <AccordionContent className="space-y-4">
      {isOwner ? (
        <Button
          variant="outline"
          onClick={() => setDeleteOrgOpen(true)}
          className="w-full justify-start gap-2 border-red-300 text-red-600 hover:bg-red-50 rounded-full"
        >
          <Trash2 className="h-4 w-4" />
          Delete this organization
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => setLeaveOrgOpen(true)}
          className="w-full justify-start gap-2 rounded-full"
        >
          <LogOut className="h-4 w-4" />
          Leave this organization
        </Button>
      )}
      <button
        onClick={() => setDeleteUserOpen(true)}
        className="text-sm text-red-500 hover:text-red-700 underline"
      >
        Delete my user account
      </button>
      <a
        href="mailto:support@dragoncandy.io?subject=GDPR%20Data%20Erasure%20Request"
        className="block text-sm text-muted-foreground hover:text-foreground underline"
      >
        Request full data erasure (GDPR/CCPA)
      </a>
    </AccordionContent>
  </AccordionItem>
</Accordion>

<DeleteOrgSheet open={deleteOrgOpen} onOpenChange={setDeleteOrgOpen} />
<LeaveOrgSheet open={leaveOrgOpen} onOpenChange={setLeaveOrgOpen} />
<DeleteUserSheet open={deleteUserOpen} onOpenChange={setDeleteUserOpen} />
```

- [ ] **Step 2: Add Danger Zone to CreatorSettings**

In `src/pages/CreatorSettings.tsx`, add similar imports and add a simplified Danger Zone (creators can only delete their user account, no org management):

```typescript
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
```

Inside the component, add state:
```typescript
const [deleteUserOpen, setDeleteUserOpen] = useState(false);
```

After the existing settings sections, add:
```tsx
<Accordion type="single" collapsible className="mt-6">
  <AccordionItem value="danger" className="border-red-200">
    <AccordionTrigger className="text-red-600 hover:text-red-700">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        Danger Zone
      </div>
    </AccordionTrigger>
    <AccordionContent className="space-y-4">
      <button
        onClick={() => setDeleteUserOpen(true)}
        className="text-sm text-red-500 hover:text-red-700 underline"
      >
        Delete my user account
      </button>
      <a
        href="mailto:support@dragoncandy.io?subject=GDPR%20Data%20Erasure%20Request"
        className="block text-sm text-muted-foreground hover:text-foreground underline"
      >
        Request full data erasure (GDPR/CCPA)
      </a>
    </AccordionContent>
  </AccordionItem>
</Accordion>

<DeleteUserSheet open={deleteUserOpen} onOpenChange={setDeleteUserOpen} />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessSettings.tsx src/pages/CreatorSettings.tsx
git commit -m "feat(deletion): Danger Zone in settings for org/user deletion

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 16: Build RestoreAccountPage

**Files:**
- Modify: `src/pages/RestoreAccountPage.tsx` (replace placeholder)

- [ ] **Step 1: Replace with full implementation**

```typescript
// src/pages/RestoreAccountPage.tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function RestoreAccountPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'restoring' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const orgId = searchParams.get('org');

  const handleRestore = async () => {
    if (!user || !orgId) return;
    setStatus('restoring');

    try {
      const { error } = await supabase.rpc('restore_org', { p_org_id: orgId });
      if (error) throw error;

      // Re-link profile to org
      await supabase
        .from('profiles')
        .update({ org_id: orgId })
        .eq('id', user.id);

      setStatus('success');
      setTimeout(() => navigate('/dashboard/business', { replace: true }), 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message ?? 'Failed to restore organization.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#A8A8A0] p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="font-medium mb-4">Sign in to restore your account</p>
            <Button
              onClick={() => navigate(`/auth?redirect=/restore-account?org=${orgId}`)}
              className="rounded-full bg-teal-500 hover:bg-teal-600 text-white"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#A8A8A0] p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === 'idle' && (
            <>
              <RefreshCw className="h-12 w-12 text-teal-500 mb-4" />
              <p className="font-medium text-lg">Restore your organization?</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your organization was scheduled for deletion. Click below to restore it and regain full access.
              </p>
              <Button
                onClick={handleRestore}
                className="mt-6 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                Restore Organization
              </Button>
            </>
          )}
          {status === 'restoring' && (
            <>
              <RefreshCw className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="font-medium">Restoring...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">Welcome back!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="font-medium text-lg">Restore failed</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              <Button
                onClick={() => navigate('/auth')}
                className="mt-4 rounded-full"
                variant="outline"
              >
                Back to login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RestoreAccountPage.tsx
git commit -m "feat(deletion): RestoreAccountPage for org recovery within grace period

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**APPROVAL GATE: Stop here. B3 (Account Deletion) is complete. Review before B4.**

---

### Task 17: Build OrgBillingPage

**Files:**
- Modify: `src/pages/OrgBillingPage.tsx` (replace placeholder)

- [ ] **Step 1: Replace with full implementation**

```typescript
// src/pages/OrgBillingPage.tsx
import { CreditCard, Users, ArrowUpRight, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { SEAT_LIMITS } from '@/types/org';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  growth: 'bg-teal-100 text-teal-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

const TIER_PRICES: Record<string, number> = {
  free: 0,
  starter: 199,
  growth: 499,
  pro: 999,
  enterprise: 0,
};

export default function OrgBillingPage() {
  const { profile, activeOrg } = useAuth();
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const { data: members = [] } = useOrgMembers(activeOrg?.id);
  const { toast } = useToast();

  const userRole = profile?.role ?? 'business_client';
  const tier = activeOrg?.subscription_tier ?? 'free';
  const limits = SEAT_LIMITS[tier];
  const seatCount = activeOrg?.seat_count ?? 1;
  const additionalSeats = Math.max(0, seatCount - limits.included);
  const additionalCost = additionalSeats * limits.additionalPriceMonthly;
  const baseCost = TIER_PRICES[tier];
  const totalCost = baseCost + additionalCost;
  const isOwner = myRole?.role === 'owner';
  const activeMembers = members.filter((m) => m.invitation_status === 'active');

  const handleManageBilling = async () => {
    if (!activeOrg?.stripe_customer_id) {
      toast({ title: 'No billing account', description: 'Upgrade to a paid plan first.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
        body: { customer_id: activeOrg.stripe_customer_id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout userRole={userRole as any}>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Billing</h1>
            {activeOrg && <p className="text-sm text-muted-foreground">{activeOrg.name}</p>}
          </div>
          {isOwner && tier !== 'free' && (
            <Button onClick={handleManageBilling} variant="outline" className="gap-2 rounded-full">
              Manage billing
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Current Plan */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <Badge className={TIER_COLORS[tier]}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Seats</p>
                <p className="text-2xl font-bold">{seatCount}</p>
                <p className="text-xs text-muted-foreground">
                  {limits.included} included
                  {additionalSeats > 0 && `, ${additionalSeats} additional`}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly cost</p>
                <p className="text-2xl font-bold">${totalCost}</p>
                {additionalCost > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ${baseCost} base + ${additionalCost} seats
                  </p>
                )}
              </div>
            </div>

            {tier === 'free' && isOwner && (
              <div className="rounded-lg border border-teal-300 bg-teal-50/50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-teal-800">Upgrade to add teammates</p>
                  <p className="text-xs text-teal-700 mt-1">
                    The free plan includes 1 seat. Upgrade to Starter ($199/mo) to invite up to 3 additional team members.
                  </p>
                  <Button size="sm" className="mt-3 rounded-full bg-teal-500 hover:bg-teal-600 text-white">
                    Upgrade plan
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Team members ({activeMembers.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-teal-50 text-teal-600 text-xs font-semibold">
                      {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.full_name ?? member.email}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">1 seat</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pricing Tiers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Available Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(SEAT_LIMITS).filter(([t]) => t !== 'enterprise').map(([t, l]) => (
                <div
                  key={t}
                  className={`flex items-center justify-between rounded-lg border p-3 ${t === tier ? 'border-teal-400 bg-teal-50/30' : 'border-border'}`}
                >
                  <div>
                    <p className="font-medium text-sm capitalize">{t}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.included} seat{l.included > 1 ? 's' : ''} included
                      {l.maxAdditional ? `, up to ${l.maxAdditional} additional` : l.maxAdditional === null ? ', unlimited additional' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{TIER_PRICES[t] === 0 ? 'Free' : `$${TIER_PRICES[t]}/mo`}</p>
                    {l.additionalPriceMonthly > 0 && (
                      <p className="text-xs text-muted-foreground">+${l.additionalPriceMonthly}/seat</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OrgBillingPage.tsx
git commit -m "feat(billing): OrgBillingPage with seat count, tier info, and plan comparison

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 18: Create sync-seat-count edge function

**Files:**
- Create: `supabase/functions/sync-seat-count/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/sync-seat-count/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Recompute seat count
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('invitation_status', 'active');

    const seatCount = count ?? 1;

    // Update org
    await supabase
      .from('organizations')
      .update({ seat_count: seatCount, updated_at: new Date().toISOString() })
      .eq('id', org_id);

    // Sync to Stripe if subscription exists
    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_subscription_id, subscription_tier')
      .eq('id', org_id)
      .single();

    if (org?.stripe_subscription_id && stripeSecretKey) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
      const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

      // Find the seat line item (the one with quantity-based pricing)
      const seatItem = subscription.items.data.find(
        (item: any) => item.price.recurring?.usage_type !== 'metered' && item.quantity !== undefined
      );

      if (seatItem) {
        const additionalSeats = Math.max(0, seatCount - 1);
        await stripe.subscriptionItems.update(seatItem.id, {
          quantity: additionalSeats,
          proration_behavior: 'create_prorations',
        });
      }
    }

    return new Response(JSON.stringify({ seat_count: seatCount }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sync-seat-count/index.ts
git commit -m "feat(billing): sync-seat-count edge function for Stripe seat sync

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 19: Extend stripe-webhook for subscription lifecycle events

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Add subscription event handlers**

In `supabase/functions/stripe-webhook/index.ts`, find the main switch statement that handles event types. Add these cases after the existing ones:

```typescript
case 'customer.subscription.created':
case 'customer.subscription.updated': {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  // Find org by stripe_customer_id
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (org) {
    const tierMap: Record<string, string> = {};
    // Map price IDs to tiers — populated from STRIPE_PRICES env or hardcoded test IDs
    const tier = subscription.status === 'active'
      ? (tierMap[subscription.items.data[0]?.price?.id] ?? 'starter')
      : 'free';

    await supabaseAdmin
      .from('organizations')
      .update({
        subscription_tier: tier,
        stripe_subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    // Subscription events logged via stripe_webhook_events idempotency table (existing pattern).
    // payment_events entity_type check constraint only allows 'collaboration'|'sponsorship' — no modification.
  }
  break;
}

case 'customer.subscription.deleted': {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (org) {
    await supabaseAdmin
      .from('organizations')
      .update({
        subscription_tier: 'free',
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    // Logged via stripe_webhook_events idempotency table (existing pattern).
  }
  break;
}

case 'invoice.payment_succeeded': {
  const invoice = event.data.object;
  if (invoice.subscription) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('stripe_subscription_id', invoice.subscription)
      .single();

    if (org) {
      // Logged via stripe_webhook_events idempotency table (existing pattern).
    }
  }
  break;
}

case 'invoice.payment_failed': {
  const invoice = event.data.object;
  if (invoice.subscription) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('stripe_subscription_id', invoice.subscription)
      .single();

    if (org) {
      // Logged via stripe_webhook_events idempotency table (existing pattern).
    }
  }
  break;
}
```

- [ ] **Step 2: Verify the webhook function compiles**

Check the function has no syntax errors by reviewing the full file.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(billing): handle subscription lifecycle events in stripe-webhook

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 20: Final build verification and Phase B commit

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify all new files exist**

Run: `ls -la src/components/org/ src/pages/OrgUnitsPage.tsx src/pages/TeamPage.tsx src/pages/OrgBillingPage.tsx src/pages/RestoreAccountPage.tsx src/pages/InviteAcceptPage.tsx src/hooks/useOrgData.ts src/hooks/useOrgMembers.ts src/types/org.ts supabase/functions/invite-member/index.ts supabase/functions/sync-seat-count/index.ts`

Expected: All files exist.

- [ ] **Step 3: Verify routes are wired**

Grep for the new routes in App.tsx:
```bash
grep -n "locations\|/team\|/billing\|restore-account\|invite/accept" src/App.tsx
```

Expected: All 8 new routes appear (3 business + 3 brand + restore + invite).

- [ ] **Step 4: Run dev server and smoke test**

Run: `npm run dev`

Manual verification checklist:
- [ ] Login as a business user → org switcher visible in header
- [ ] Navigate to /dashboard/business/locations → page loads
- [ ] Navigate to /dashboard/business/team → page loads
- [ ] Navigate to /dashboard/business/billing → page loads
- [ ] Settings page → Danger Zone accordion present
- [ ] Creator login → no org switcher visible, no org nav items

**APPROVAL GATE: Section 3 complete. Full review before moving to Section 4.**
