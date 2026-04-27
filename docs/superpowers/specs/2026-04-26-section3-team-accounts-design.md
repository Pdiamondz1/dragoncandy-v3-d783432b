# Section 3: Team Accounts — Design Spec

**Date:** 2026-04-26
**Phase:** Launch Playbook Section 3 (P2.1 — P2.5)
**Approach:** Schema-first batch (Phase A), then sequential UI (Phase B)

---

## Context

DragonCandy currently assumes one user = one account. Restaurant and Brand users need multi-location/multi-product management, team invites with role-based access, account deletion with GDPR compliance, and per-seat billing via Stripe.

### Codebase Adaptations from Playbook

The playbook was written against assumed schema names. Actual codebase differs:

| Playbook Assumption | Actual Codebase | Resolution |
|---|---|---|
| `user_role` enum: `'business' \| 'creator' \| 'brand'` | `'business_client' \| 'content_creator'` | Keep existing enum untouched |
| Role differentiation via `user_role` | `business_profiles.account_type`: `'restaurant' \| 'brand'` | Derive `org_type` from `account_type` |
| `payment_ledger` table | `payment_events` (append-only) | All "PROTECT payment_ledger" → protect `payment_events` |
| `profiles.user_role` has `'brand'` value | `'brand'` exists in enum but brands use `business_client` role + `account_type='brand'` | Org creation uses `account_type`, not `role` |

---

## Phase A: Unified Schema Migration

Single migration file: `supabase/migrations/<timestamp>_team_accounts.sql`

### A1. New Table — `organizations`

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null check (org_type in ('restaurant','brand')),
  slug text unique,
  logo_url text,
  billing_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_tier text default 'free'
    check (subscription_tier in ('free','starter','growth','pro','enterprise')),
  seat_count int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  hard_purge_at timestamptz
);
```

Indexes: `(org_type, deleted_at)`, `(stripe_customer_id)`

### A2. New Table — `org_units`

```sql
create table org_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  unit_type text not null check (unit_type in ('location','product')),
  name text not null,
  address text,
  lat numeric,
  lng numeric,
  website_url text,
  logo_url text,
  is_primary boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Index: `(org_id, deleted_at)`

### A3. New Table — `org_members`

```sql
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','standard')),
  invited_by uuid references auth.users(id),
  invitation_status text default 'active'
    check (invitation_status in ('invited','active','suspended')),
  invited_at timestamptz,
  joined_at timestamptz,
  last_active_at timestamptz,
  unique (org_id, user_id)
);
```

Index: `(user_id, invitation_status)`

### A4. New Table — `account_deletion_requests`

```sql
create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id),
  target_type text not null
    check (target_type in ('org','org_unit','member','user_self')),
  target_id uuid not null,
  status text default 'pending'
    check (status in ('pending','soft_deleted','hard_purged','restored','rejected')),
  reason_code text,
  soft_deleted_at timestamptz,
  hard_purge_scheduled_at timestamptz,
  hard_purged_at timestamptz,
  restored_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
```

### A5. Column Additions

- **`profiles`**: `org_id uuid references organizations(id)`, `active_org_unit_id uuid references org_units(id)` — both nullable
- **`campaigns`**: `org_id uuid references organizations(id)`, `org_unit_id uuid references org_units(id)` — both nullable
- **`campaign_applications`**: `org_id uuid references organizations(id)` — nullable

### A6. RLS Policies

All new tables have RLS enabled. Policies:

**organizations:**
- SELECT: user has an active `org_members` row in this org
- UPDATE: owner role only
- DELETE: blocked (use `request_org_deletion` function instead)

**org_units:**
- SELECT: active member of parent org
- INSERT/UPDATE/DELETE: owner or admin role

**org_members:**
- SELECT: active member of same org
- INSERT: owner/admin only
- UPDATE: owner can change anyone; admin can change standard; standard can only update self
- DELETE: owner can remove anyone; admin can remove standard/admin; standard can remove self only

**campaigns (extended):**
- Existing creator browse SELECT policies preserved
- INSERT/UPDATE: scoped by org_id matching user's active org membership

**campaign_applications (extended):**
- Existing creator-owned SELECT preserved
- INSERT: org_id auto-populated from parent campaign via trigger

**account_deletion_requests:**
- SELECT/INSERT: requesting user OR owner/admin of target org

### A7. Security-Definer Functions

**`request_org_deletion(p_org_id uuid)`**
- Only callable by org owner
- Sets `organizations.deleted_at = now()`, `hard_purge_at = now() + interval '30 days'`
- Inserts `account_deletion_requests` row with `status = 'soft_deleted'`
- Returns the deletion request id

**`restore_org(p_org_id uuid)`**
- Only callable by org owner
- Only valid if `hard_purge_at > now()`
- Clears `deleted_at` and `hard_purge_at`
- Updates deletion request to `status = 'restored'`

**`force_gdpr_erasure(p_user_id uuid)`**
- Service-role only (support flow)
- Hard purges user immediately
- Anonymizes creator credit on delivered campaign content

**`cron_hard_purge_expired()`**
- Finds orgs where `deleted_at IS NOT NULL AND hard_purge_at < now()`
- For user-self deletions: anonymizes `campaign_collaborations.creator_id` (set to NULL) where the creator is the deleted user; delivered content in `campaigns.campaign_media` (JSONB) is retained but the creator reference is severed
- Deletes org row (cascades to units, members) or user profile row
- Scrubs PII from `creator_profiles` / `business_profiles` for the affected users
- Updates deletion requests to `status = 'hard_purged'`

### A8. Triggers

- **`campaigns` INSERT**: auto-populate `org_id` from authenticated user's `profiles.active_org_unit_id` → `org_units.org_id` lookup
- **`campaign_applications` INSERT**: auto-populate `org_id` from parent `campaigns.org_id`
- **`org_members` INSERT/UPDATE/DELETE**: update `organizations.seat_count` with count of active members

### A9. Backfill (idempotent)

For every `business_profiles` row where the user has no `org_members` row:

1. Create one `organizations` row:
   - `name` = `"[business_name]'s Workspace"`
   - `org_type` = `business_profiles.account_type` (`'restaurant'` or `'brand'`)
2. Create one `org_units` row:
   - `unit_type` = `'location'` if restaurant, `'product'` if brand
   - `name` = `business_profiles.business_name`
   - `is_primary = true`
   - Address fields from `business_profiles.location`/`city`/`postal_code`/`country`
   - `website_url` from `business_profiles.website_url` (brands)
3. Create one `org_members` row: `role = 'owner'`, `invitation_status = 'active'`
4. Update `profiles.org_id` and `profiles.active_org_unit_id`
5. Backfill `campaigns.org_id` and `campaigns.org_unit_id` from owning user

Content creators are **skipped** entirely.

### A10. Protected Items

- `payment_events` table: no modifications
- `profiles.role` enum: no modifications
- `stripe_webhook_events` table: no modifications
- Existing creator-facing RLS policies: preserved
- All new columns are nullable or have defaults

---

## Phase B: UI Features (Sequential)

### B1. Org Unit Switcher + Sub-Account List

**OrgUnitSwitcher component** (`src/components/org/OrgUnitSwitcher.tsx`):
- Placement: `DashboardLayout.tsx` header, right side before profile dropdown
- Pill button showing active unit name + chevron icon
- Restaurant label: `"📍 [name] ▾"` | Brand label: `"🏷️ [name] ▾"`
- Opens Sheet (mobile) / Popover (desktop):
  - "Switch location/product" header
  - Search input if > 5 units
  - Unit list with checkmark on active
  - "+ Add new location/product" footer (owner/admin only)
- On select: update `profiles.active_org_unit_id`, invalidate React Query cache
- Hidden for `content_creator` role
- Uses existing shadcn: Sheet, Popover, Command (for search)

**OrgUnitsPage** (`src/pages/OrgUnitsPage.tsx`):
- Route: `/dashboard/business/locations` (restaurant) or `/dashboard/brand/products` (brand)
- Added to `businessSidebarNav` and `brandSidebarNav` in navConfig.ts
- Unit cards: logo/initial avatar, name, address/website, active campaigns count, status badge
- 3-dot menu: Edit | Set as default | Delete (owner/admin only, using DropdownMenu)
- "+ Add" CTA at top (owner/admin)
- Empty state for single-unit orgs

**AddEditUnitModal** (`src/components/org/AddEditUnitModal.tsx`):
- Restaurant form: name, address, logo upload, primary toggle
- Brand form: name, website URL, category, logo upload, primary toggle
- Uses existing shadcn: Dialog, Input, Switch
- Save: insert/update `org_units`, refresh switcher

**Permission gating:**
- Owner: full CRUD
- Admin: full CRUD except cannot delete last unit
- Standard: switch only, all write buttons hidden

**React Query hooks** (`src/hooks/useOrgData.ts`):
- `useOrg()` — fetch current user's org
- `useOrgUnits()` — fetch units for active org
- `useActiveOrgUnit()` — current active unit
- `useUpdateActiveUnit()` — mutation to switch units

### B2. Team Management + Invites

**TeamPage** (`src/pages/TeamPage.tsx`):
- Route: `/dashboard/business/team` and `/dashboard/brand/team`
- Replaces placeholder in brand drawer nav; added to business sidebar nav
- Member list: avatar, name, email, role badge (color-coded), joined date, last active
- Filter pills: All | Owners | Admins | Standard | Pending
- Search input if > 10 members
- Role-change dropdown per row (visibility per permission matrix)
- Remove member action (sets `invitation_status = 'suspended'`)

**InviteModal** (`src/components/org/InviteModal.tsx`):
- Textarea: paste comma-separated emails or one per line
- Role selector pill group: Standard (default) | Admin | Owner (owner-assignable only by owner)
- "Send invites" button → calls edge function, shows per-email status

**Edge function** — `supabase/functions/invite-member/index.ts`:
- Auth: verifies caller is owner/admin via `org_members` join
- Input: `{ org_id, email, role }`
- Existing user: insert `org_members` row with `invitation_status = 'invited'`, send join email
- New user: send magic-link signup email with `org_id` + `role` encoded in redirect URL
- Returns per-email status array

**Invite acceptance page** — `/invite/accept`:
- Route: `/invite/accept?org=...&token=...`
- Validates token, sets `org_members.invitation_status = 'active'`, `joined_at = now()`
- Redirects to org dashboard with welcome toast

**Seat count trigger** fires on acceptance → updates `organizations.seat_count`

**Permission matrix (UI + RLS):**
- Owner: invite anyone, change any role, remove anyone (except self if last owner)
- Admin: invite standard/admin, change standard ↔ admin, remove standard/admin, can't touch owners
- Standard: read-only team view, can only leave (remove self)

### B3. Account Deletion

**Danger Zone section** in `BusinessSettings.tsx` and `CreatorSettings.tsx`:
- New accordion section at bottom with red accent
- Content varies by org role:
  - Owner: "Delete this organization" red outlined button
  - Admin/Standard: "Leave this organization" outlined button
  - All: "Delete my user account" red text link
  - All: "Request full data erasure (GDPR/CCPA)" link

**DeleteOrgSheet** (`src/components/org/DeleteOrgSheet.tsx`):
- Bottom sheet explaining 30-day grace period
- Type org name to confirm (necessary friction for destructive action)
- Red "Delete organization" button, disabled until name matches
- On confirm: calls `request_org_deletion()`, logs out, sends restore email

**RestoreAccountPage** (`src/pages/RestoreAccountPage.tsx`):
- Route: `/restore-account`
- Requires re-authentication
- Calls `restore_org()`, redirects to dashboard with "Welcome back" banner

**LeaveOrgSheet** (`src/components/org/LeaveOrgSheet.tsx`):
- Confirmation: "Leave [Org Name]? You'll lose access."
- Sets `org_members.invitation_status = 'suspended'`
- Redirects to other orgs or onboarding if last org

**DeleteUserSheet** (`src/components/org/DeleteUserSheet.tsx`):
- Pre-flight: blocks if user owns orgs with active members
- Type "DELETE" to confirm
- Soft-deletes profile, invalidates session

**GDPR link**: Opens Donny chat or mailto support with pre-filled template. Manual process for launch.

**pg_cron job**: Schedule `cron_hard_purge_expired()` at 03:00 UTC daily via migration.

### B4. Billing Page

**OrgBillingPage** (`src/pages/OrgBillingPage.tsx`):
- Route: `/dashboard/business/billing` and `/dashboard/brand/billing`
- Added to sidebar nav for both roles
- Current tier badge with color coding
- Seat usage: "[used] of [included] included, [additional] additional ($X/mo)"
- Monthly cost line with next charge date
- Members list with seat tooltip
- "Upgrade plan" → Stripe Customer Portal session
- "Cancel subscription" → deletion flow or downgrade to Free

**Edge function** — `supabase/functions/sync-seat-count/index.ts`:
- Called by DB trigger on `org_members` status changes
- Recomputes: `SELECT count(*) FROM org_members WHERE org_id = $1 AND invitation_status = 'active'`
- Updates `organizations.seat_count`
- Calls Stripe API: update subscription line item quantity to `seat_count - 1` (base includes 1)
- Stripe handles proration

**Seat limits (enforced in invite flow):**

| Tier | Included Seats | Max Additional | Additional $/mo |
|---|---|---|---|
| Free | 1 (owner only) | 0 | — |
| Starter ($199/mo) | 1 | 3 | $29/mo each |
| Growth ($499/mo) | 5 | 15 | $39/mo each |
| Pro ($999/mo) | 15 | unlimited | $49/mo each |
| Enterprise | custom | custom | custom |

Free tier invite → "Upgrade to Starter to add teammates" prompt.

**Webhook handling** — extend existing `stripe-webhook` edge function:
- Handle: `customer.subscription.created`, `updated`, `deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Each writes to `payment_events`, updates `organizations.subscription_tier`
- Reuses existing `stripe_webhook_events` idempotency pattern

**Downgrade protection**: If user tries to downgrade to tier with fewer seats than active members, block with message showing the math.

---

## AuthContext Extension

**New fields on `AuthContextType`:**
- `activeOrg: Organization | null`
- `activeOrgUnit: OrgUnit | null`
- `switchOrgUnit: (unitId: string) => Promise<void>`

**New hook** — `useOrgContext()`:
- Wraps org-aware React Query hooks
- Provides `orgId` and `orgUnitId` for scoping all dashboard queries

**Route guard updates:**
- `BusinessRoute` and `BrandRoute` unchanged in auth check logic
- Add org context loading after auth — backwards-compatible since backfill ensures every business user has an org

---

## New Files Summary

| File | Type |
|---|---|
| `supabase/migrations/<ts>_team_accounts.sql` | Migration |
| `supabase/functions/invite-member/index.ts` | Edge function |
| `supabase/functions/sync-seat-count/index.ts` | Edge function |
| `src/components/org/OrgUnitSwitcher.tsx` | Component |
| `src/components/org/AddEditUnitModal.tsx` | Component |
| `src/components/org/InviteModal.tsx` | Component |
| `src/components/org/DeleteOrgSheet.tsx` | Component |
| `src/components/org/LeaveOrgSheet.tsx` | Component |
| `src/components/org/DeleteUserSheet.tsx` | Component |
| `src/hooks/useOrgData.ts` | Hooks |
| `src/pages/OrgUnitsPage.tsx` | Page |
| `src/pages/TeamPage.tsx` | Page |
| `src/pages/OrgBillingPage.tsx` | Page |
| `src/pages/RestoreAccountPage.tsx` | Page |
| `src/pages/InviteAcceptPage.tsx` | Page |

## Modified Files Summary

| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Add org/unit state, switchOrgUnit method |
| `src/components/DashboardLayout.tsx` | Insert OrgUnitSwitcher in header |
| `src/lib/navConfig.ts` | Add Locations/Products, Team, Billing nav items |
| `src/pages/BusinessSettings.tsx` | Add Danger Zone accordion section |
| `src/pages/CreatorSettings.tsx` | Add Danger Zone section (user deletion only) |
| `src/integrations/supabase/types.ts` | Regenerate with new tables |
| `supabase/functions/stripe-webhook/index.ts` | Handle subscription lifecycle events |
| `src/App.tsx` | Add new routes |
