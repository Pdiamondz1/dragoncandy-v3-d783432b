# Org Backfill Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill `organizations`, `org_units`, and `org_members` records for all pre-existing business/brand accounts so that Team, Locations/Products, and Billing pages are fully functional.

**Architecture:** A single idempotent SQL migration that mirrors the logic in `trg_auto_create_org_fn()` (defined in `supabase/migrations/20260427220000_auto_create_org_on_business_profile.sql`). It iterates over every `business_profiles` row that has no `org_members` record and creates the org, unit, member, and profile linkage. This is a re-run of the same backfill pattern from `supabase/migrations/20260426200000_team_accounts.sql` STEP 6 to catch accounts that were missed.

**Tech Stack:** PostgreSQL (PL/pgSQL), Supabase migrations

---

### Task 1: Write the backfill migration SQL

**Files:**
- Create: `supabase/migrations/20260428100000_backfill_orgs_for_existing_accounts.sql`

**Reference files (read-only):**
- `supabase/migrations/20260426200000_team_accounts.sql` (lines 594-680 — original backfill in STEP 6)
- `supabase/migrations/20260427220000_auto_create_org_on_business_profile.sql` (auto-create trigger logic)

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260428100000_backfill_orgs_for_existing_accounts.sql` with the following content:

```sql
-- ============================================================================
-- Backfill: Create org records for pre-existing business/brand accounts
-- ============================================================================
-- Re-runs the idempotent backfill from 20260426200000_team_accounts.sql (STEP 6)
-- to catch any business_profiles rows that still lack org_members records.
-- Safe to run multiple times — skips users who already have an org membership.

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
    v_org_type := case
      when rec.account_type = 'brand' then 'brand'
      else 'restaurant'
    end;

    v_unit_type := case
      when v_org_type = 'brand' then 'product'
      else 'location'
    end;

    -- 1. Create organization
    insert into organizations (name, org_type, logo_url, billing_email)
    select
      coalesce(nullif(rec.business_name, ''), 'My Business') || '''s Workspace',
      v_org_type,
      rec.logo_url,
      p.email
    from profiles p
    where p.id = rec.user_id
    returning id into v_org_id;

    -- 2. Create primary org_unit
    insert into org_units (org_id, unit_type, name, address, website_url, logo_url, is_primary)
    values (
      v_org_id,
      v_unit_type,
      coalesce(nullif(rec.business_name, ''), 'Primary'),
      rec.location,
      rec.website_url,
      rec.logo_url,
      true
    )
    returning id into v_unit_id;

    -- 3. Create org_members row (owner, active)
    insert into org_members (org_id, user_id, role, invitation_status, joined_at)
    values (v_org_id, rec.user_id, 'owner', 'active', now());

    -- 4. Link profiles to the new org
    update profiles
    set org_id = v_org_id,
        active_org_unit_id = v_unit_id,
        updated_at = now()
    where id = rec.user_id;

    -- 5. Backfill campaigns.org_id
    update campaigns
    set org_id = v_org_id,
        org_unit_id = v_unit_id,
        updated_at = now()
    where user_id = rec.user_id
      and org_id is null;

    -- 6. Backfill campaign_applications.org_id
    update campaign_applications ca
    set org_id = v_org_id
    from campaigns c
    where c.id = ca.campaign_id
      and c.user_id = rec.user_id
      and ca.org_id is null;
  end loop;
end;
$$;
```

- [ ] **Step 2: Verify the migration file exists**

Run:
```bash
cat supabase/migrations/20260428100000_backfill_orgs_for_existing_accounts.sql | head -5
```

Expected: The first 5 lines of the migration file showing the comment header.

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/20260428100000_backfill_orgs_for_existing_accounts.sql
git commit -m "fix: backfill org records for pre-existing business/brand accounts

Pre-existing accounts created before the org system was added have no
organizations, org_units, or org_members records. This makes Team,
Locations, and Products pages non-functional (no Add/Invite buttons).

This migration re-runs the idempotent backfill to create the missing
records for all affected users."
```

---

### Task 2: Apply the migration to the live database

**Files:**
- None (uses Supabase MCP tool)

- [ ] **Step 1: Check how many accounts need backfilling**

Run this query against the live database using the Supabase MCP `execute_sql` tool:

```sql
select count(*) as accounts_needing_backfill
from business_profiles bp
where not exists (
  select 1 from org_members om where om.user_id = bp.user_id
);
```

Record the count. If 0, the backfill is already complete and no further action is needed.

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool to apply:
- Migration name: `backfill_orgs_for_existing_accounts`
- SQL: the full content of `supabase/migrations/20260428100000_backfill_orgs_for_existing_accounts.sql`

- [ ] **Step 3: Verify the backfill succeeded**

Run this verification query using the Supabase MCP `execute_sql` tool:

```sql
select
  (select count(*) from business_profiles bp
   where not exists (select 1 from org_members om where om.user_id = bp.user_id)
  ) as still_missing,
  (select count(*) from org_members where role = 'owner') as total_owners,
  (select count(*) from organizations) as total_orgs,
  (select count(*) from org_units where is_primary = true) as total_primary_units;
```

Expected:
- `still_missing` = 0
- `total_owners`, `total_orgs`, `total_primary_units` should all have increased by the count from Step 1

- [ ] **Step 4: Spot-check a backfilled account**

Run this query to verify one specific backfilled account has correct data:

```sql
select
  p.id as user_id,
  p.org_id,
  p.active_org_unit_id,
  o.name as org_name,
  o.org_type,
  ou.name as unit_name,
  ou.unit_type,
  ou.is_primary,
  om.role,
  om.invitation_status
from profiles p
join organizations o on o.id = p.org_id
join org_units ou on ou.id = p.active_org_unit_id
join org_members om on om.org_id = o.id and om.user_id = p.id
where p.role in ('business_client', 'brand')
limit 3;
```

Expected: Each row shows `role = 'owner'`, `invitation_status = 'active'`, `is_primary = true`, and correct `org_type`/`unit_type` pairing (restaurant/location or brand/product).

- [ ] **Step 5: Commit verification notes (optional)**

No code change needed. The migration is applied and verified. Log in to dragoncandy.io with a test account to confirm:
1. Team page shows the "Invite" button and displays the owner as a member
2. Locations/Products page shows the "Add" button and displays the primary unit
3. Billing page shows 1 team member
