# Org Backfill Migration — Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Problem

Pre-existing business/brand accounts created before the org system was added have no `organizations`, `org_units`, or `org_members` records. This causes:

- Team page: no "Invite" button, no member cards
- Locations/Products page: no "Add" button, empty state with no way to add
- Billing page: displays correctly but shows 0 team members
- All CRUD actions (add, edit, remove team members / locations / products) are invisible because they're gated on `canManage` / `canInvite` checks that require an `owner` or `admin` role in `org_members`

The auto-create trigger (`trg_auto_create_org_fn`) only fires on new `business_profiles` INSERTs, so existing accounts were never backfilled.

## Solution

A single idempotent SQL migration that retroactively creates org records for all business/brand users who lack them, mirroring the exact logic of the existing `trg_auto_create_org_fn()` trigger.

## What the migration creates per user

For each `business_profiles` row where the user has no `org_members` record:

1. **`organizations`** — name: `"{business_name}'s Workspace"` (fallback: `"My Business's Workspace"`), `org_type`: `'brand'` if `account_type = 'brand'`, else `'restaurant'`
2. **`org_units`** — one primary unit, `unit_type`: `'product'` for brands / `'location'` for restaurants, name from `business_name` (fallback: `"Primary"`)
3. **`org_members`** — user as `owner`, `invitation_status = 'active'`, `joined_at = now()`
4. **`profiles`** update — sets `org_id` and `active_org_unit_id`

## Safety guarantees

- **Idempotent:** Skips users who already have an `org_members` record
- **Null-safe:** Falls back to `'My Business'` / `'Primary'` for missing `business_name`
- **Account type detection:** Uses `business_profiles.account_type` column; null defaults to restaurant (matches trigger logic)
- **No downtime:** Additive only — INSERTs and foreign key UPDATEs, no DDL changes
- **RLS-safe:** Runs as migration (superuser context), not subject to RLS
- **Scope:** Only `business_profiles` users; creators are unaffected (they don't have orgs)

## Expected outcome

After running, every business/brand user will have:
- An organization with the correct `org_type`
- A primary org unit (location or product)
- An `org_members` record with `role = 'owner'`
- `profiles.org_id` and `profiles.active_org_unit_id` populated

This makes all Team, Locations/Products, and Billing page buttons visible and functional for both mobile and desktop views.

## Approach

**Approach A: SQL Migration Only** (selected over app-level lazy backfill and hybrid approaches). The trigger handles new signups; this one-time migration handles the backlog. No app code changes needed.
