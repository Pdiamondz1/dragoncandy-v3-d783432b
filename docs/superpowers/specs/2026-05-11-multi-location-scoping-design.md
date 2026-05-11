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

### 1. OrgUnitSwitcher

**File:** `src/components/org/OrgUnitSwitcher.tsx`

Add an "All Locations" (restaurants) or "All Products" (brands) entry at the top of the dropdown list, above the real units. Uses a globe/layers icon. When selected, calls `updateActive.mutateAsync(null)` to clear `active_org_unit_id`.

The trigger button currently renders `activeOrgUnit.name` and returns `null` if `!activeOrgUnit`. Update it to show "All Locations" / "All Products" when `activeOrgUnit` is undefined, using the globe icon. The component no longer early-returns when `activeOrgUnit` is absent — it renders in the "all" state instead.

The switcher remains single-select. "All Locations" is just another entry in the list.

### 2. useUpdateActiveUnit

**File:** `src/hooks/useOrgData.ts`

The mutation currently accepts `string` for the unit ID. Update the type to `string | null` so it can clear the active unit. The underlying `.update({ active_org_unit_id: orgUnitId })` already handles null since the column is nullable. No other changes needed.

### 3. Campaign Query Hooks

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

### 4. Campaign Creation

**File:** `src/hooks/useCampaignMutations.ts`

`CreateCampaignData` interface gains `org_unit_id?: string | null`.

The `useCreateCampaign` hook reads `activeOrgUnit` from `useAuth()` inside the mutation function and includes `org_unit_id: activeOrgUnit?.id ?? null` in the insert payload.

**Creation guard:** If `activeOrgUnit` is undefined (user is on "All Locations") and the user attempts to create a campaign, show a toast: "Switch to a specific location to create a campaign." Prevent the insert. This avoids orphaned campaigns with null `org_unit_id`.

### 5. Business Dashboard

**File:** `src/pages/BusinessDashboard.tsx`

The dashboard reads `activeOrgUnit` from `useAuth()` and passes `activeOrgUnit?.id` into `useBusinessActiveCampaigns(orgUnitId)`. Since React Query keys include the unit ID, switching locations in the header triggers automatic refetch. No new components or layout changes.

Metrics cards (Active Campaigns, Creators, Spend) derive from the already-filtered campaign data. The numbers are correct by construction.

**File:** `src/components/dashboard/ActiveCampaignsFeed.tsx`

Receives filtered campaign data from its parent. In the "All Locations" view, each campaign card shows a small location badge (the org unit name) so owners can distinguish at a glance.

### 6. Campaign List Page

The business campaigns list page reads `activeOrgUnit` from auth context and passes the ID into `useCampaignsList`. The "View all" link from the dashboard feed lands on an already-filtered list consistent with the selected location.

### 7. Backfill Existing Campaigns

One-time SQL migration to assign existing campaigns (where `org_unit_id IS NULL`) to the campaign owner's primary org unit:

```sql
UPDATE campaigns c
SET org_unit_id = ou.id
FROM org_units ou
WHERE ou.org_id = (
  SELECT p.org_id FROM profiles p WHERE p.id = c.user_id
)
AND ou.is_primary = true
AND c.org_unit_id IS NULL;
```

This ensures existing campaigns appear under the primary location rather than only under "All Locations."

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
| `src/components/org/OrgUnitSwitcher.tsx` | Add "All Locations" entry, handle null activeOrgUnit |
| `src/hooks/useOrgData.ts` | Accept `null` in `useUpdateActiveUnit` |
| `src/hooks/useCampaignQueries.ts` | Add `orgUnitId` param, update Campaign interface, add to select |
| `src/hooks/useBusinessActiveCampaigns.ts` | Add `orgUnitId` param and location filter |
| `src/hooks/useCampaignMutations.ts` | Include `org_unit_id` in create, add creation guard |
| `src/pages/BusinessDashboard.tsx` | Pass `activeOrgUnit?.id` to campaign hooks |
| `src/components/dashboard/ActiveCampaignsFeed.tsx` | Show location badge in "All Locations" view |
| SQL migration | Backfill existing campaigns to primary org unit |
