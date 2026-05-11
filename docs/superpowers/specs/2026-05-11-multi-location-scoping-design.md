# Multi-Location Scoping for Restaurant & Brand Accounts

**Date:** 2026-05-11
**Status:** Approved design, pending implementation

## Problem

The OrgUnitSwitcher lets restaurant and brand users toggle between locations (or products), but the selection is cosmetic. Switching locations doesn't change what the user sees on the dashboard, which campaigns appear, or which location new campaigns belong to. The infrastructure exists — `org_units` table, `campaigns.org_unit_id` FK, `profiles.active_org_unit_id` — but nothing reads from it.

## Scope

**In scope (Phase 1):**

- Campaign creation auto-tags with the active location's `org_unit_id`
- Campaign list queries filter by active location
- Dashboard metrics reflect the active location
- OrgUnitSwitcher gains an "All Locations" / "All Products" aggregate option
- Backfill existing campaigns to their owner's primary org unit

**Deferred (Phase 2):**

- Messages/conversations scoped to location (show all with location badges instead)
- DragonShare post targeting by `target_org_unit_id`
- Creator-facing location filters in the marketplace

## Approach

Query-level filtering via React Query hooks. The active `org_unit_id` propagates from `useAuth()` into campaign hooks as a query parameter. React Query keys include the unit ID so switching locations triggers automatic refetch. No RLS changes, no new database columns — all infrastructure already exists.

## Design

### 1. AuthContext — Null-Safe Location State

**File:** `src/contexts/AuthContext.tsx`

The `switchOrgUnit` function currently accepts `string` only. Update to accept `string | null`. When called with `null`, it sets `activeOrgUnit` to `null` in context state, clears `active_org_unit_id` in the database, and skips the org unit fetch. This is the critical fix — without it, selecting "All Locations" leaves stale `activeOrgUnit` data in context until page refresh.

All downstream consumers already read `activeOrgUnit` from `useAuth()`. When it's `null`, they treat it as "All Locations" mode.

### 2. OrgUnitSwitcher

**File:** `src/components/org/OrgUnitSwitcher.tsx`

Add an "All Locations" (restaurants) or "All Products" (brands) entry at the top of the dropdown list, above the real units. Uses a globe/layers icon. When selected, calls `switchOrgUnit(null)` via AuthContext (not `useUpdateActiveUnit` directly) to ensure both database and context state update together.

The trigger button currently renders `activeOrgUnit.name` and returns `null` if `!activeOrgUnit`. Update it to show "All Locations" / "All Products" when `activeOrgUnit` is null, using the globe icon. The component no longer early-returns when `activeOrgUnit` is absent — it renders in the "all" state instead.

The switcher remains single-select. "All Locations" is just another entry in the list.

### 3. useUpdateActiveUnit

**File:** `src/hooks/useOrgData.ts`

The mutation currently accepts `string` for the unit ID. Update the type to `string | null` so it can clear the active unit. The underlying `.update({ active_org_unit_id: orgUnitId })` already handles null since the column is nullable. No other changes needed.

### 4. Campaign Query Hooks

**File:** `src/hooks/useCampaignQueries.ts`

`useCampaignsList(filterByOwnership, orgUnitId?)`:
- New optional parameter `orgUnitId?: string | null`
- When `orgUnitId` is a non-null string, add `.eq('org_unit_id', orgUnitId)` to the query
- When null or undefined, no location filter applied (all locations)
- Query key becomes `['campaigns', user?.id, filterByOwnership, orgUnitId ?? 'all']`
- Add `org_unit_id` to the `.select()` field list

`Campaign` interface gains `org_unit_id?: string | null`.

**File:** `src/hooks/useBusinessActiveCampaigns.ts`

`useBusinessActiveCampaigns(orgUnitId?)`:
- Same pattern: optional `orgUnitId` parameter
- When non-null, add `.eq('org_unit_id', orgUnitId)` to the campaigns query
- Query key becomes `['business_active_campaigns', user?.id, orgUnitId ?? 'all']`

**Additional campaign hooks to update with the same pattern:**
- `useBrandActiveCampaigns` (if it exists as a separate hook for brand dashboards)
- `useBusinessDashboardMetrics` (if dashboard metrics are fetched via a separate hook)

Any hook that queries campaigns and feeds into a location-aware view must accept and apply the `orgUnitId` filter.

### 5. Campaign Creation

**File:** `src/hooks/useCampaignMutations.ts`

`CreateCampaignData` interface gains `org_unit_id?: string | null`.

The `useCreateCampaign` hook destructures `activeOrgUnit` from `useAuth()` at the hook level (alongside `user`). The `mutationFn` closure captures this value and includes `org_unit_id: activeOrgUnit?.id ?? null` in the insert payload.

**Creation guard:** The guard lives in the campaign creation submission handler — wherever `createCampaign.mutateAsync(...)` is called. Before invoking the mutation, check if `activeOrgUnit` is null. If so, show a toast: "Switch to a specific location to create a campaign" and return early. This avoids orphaned campaigns with null `org_unit_id`.

**Campaign duplication:** The `useDuplicateCampaign` hook must also include `org_unit_id` in its `.select()` and insert. Duplicated campaigns should inherit the source campaign's `org_unit_id`, not the currently active unit — preserving the original location assignment.

### 6. Business Dashboard

**File:** `src/pages/BusinessDashboard.tsx`

The dashboard reads `activeOrgUnit` from `useAuth()` and passes `activeOrgUnit?.id` into `useBusinessActiveCampaigns(orgUnitId)`. Since React Query keys include the unit ID, switching locations in the header triggers automatic refetch. No new components or layout changes.

Metrics cards (Active Campaigns, Creators, Spend) derive from the already-filtered campaign data. The numbers are correct by construction.

**File:** `src/components/dashboard/ActiveCampaignsFeed.tsx`

Receives filtered campaign data from its parent. In the "All Locations" view, each campaign card shows a small location badge (the org unit name) so owners can distinguish at a glance.

### 7. Campaign List Page

The business campaigns list page reads `activeOrgUnit` from auth context and passes the ID into `useCampaignsList`. The "View all" link from the dashboard feed lands on an already-filtered list consistent with the selected location.

### 8. Backfill Existing Campaigns

One-time SQL migration to assign existing campaigns (where `org_unit_id IS NULL`) to the campaign owner's primary org unit:

```sql
UPDATE campaigns c
SET org_unit_id = (
  SELECT ou.id
  FROM org_units ou
  JOIN profiles p ON p.org_id = ou.org_id
  WHERE p.id = c.user_id
    AND ou.is_primary = true
    AND ou.deleted_at IS NULL
  LIMIT 1
)
WHERE c.org_unit_id IS NULL;
```

This ensures existing campaigns appear under the primary location rather than only under "All Locations."

**Edge cases:**
- Campaigns belonging to users whose orgs have no primary unit remain with `org_unit_id = NULL` (visible only under "All Locations"). This is acceptable — the owner can reassign by editing the campaign later.
- The `LIMIT 1` prevents nondeterministic results if an org has multiple units marked as primary (no unique constraint on `(org_id, is_primary)` exists today).

## What This Deletes

- The illusion that switching locations changes context (it now actually does)

## What This Simplifies

- Campaign ownership: every campaign belongs to exactly one location
- Dashboard metrics: always scoped to what the user is looking at

## What This Automates

- Location tagging on campaign creation (inherits from switcher, zero keystrokes)
- Dashboard filtering (automatic refetch on location switch)

## Keystroke Count Removed

Campaign creation: 0 additional keystrokes for location assignment (was 0 before, but now it actually works). Location switching already existed — it just starts doing something.

## Files Modified

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Update `switchOrgUnit` to accept `string \| null`, handle null state |
| `src/components/org/OrgUnitSwitcher.tsx` | Add "All Locations" entry, use `switchOrgUnit(null)`, handle null activeOrgUnit |
| `src/hooks/useOrgData.ts` | Accept `null` in `useUpdateActiveUnit` |
| `src/hooks/useCampaignQueries.ts` | Add `orgUnitId` param, update Campaign interface, add to select |
| `src/hooks/useBusinessActiveCampaigns.ts` | Add `orgUnitId` param and location filter |
| `src/hooks/useCampaignMutations.ts` | Include `org_unit_id` in create + duplicate, add creation guard |
| `src/pages/BusinessDashboard.tsx` | Pass `activeOrgUnit?.id` to campaign hooks |
| `src/components/dashboard/ActiveCampaignsFeed.tsx` | Show location badge in "All Locations" view |
| Additional campaign hooks (`useBrandActiveCampaigns`, `useBusinessDashboardMetrics`) | Add `orgUnitId` filter if they exist and feed location-aware views |
| SQL migration | Backfill existing campaigns to primary org unit |
