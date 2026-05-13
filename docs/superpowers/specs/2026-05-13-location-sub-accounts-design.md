# Location Sub-Accounts — Design Spec

**Date:** 2026-05-13
**Status:** Draft
**Author:** Dame + Claude

## Problem

Restaurant users cannot add new locations — the "Add Location" modal fails with "Something went wrong" due to a migration that hasn't been applied to production. Beyond the bug, locations that do exist lack full feature parity: messaging, analytics, file uploads, and Dragon Feed are not location-aware, making multi-location restaurants unable to see per-location data. The location switching UX lacks visual identity, making it easy to lose track of which location you're working in.

## Solution

Fix the create-location bug, add `org_unit_id` scoping to all remaining features, and build a rich location identity UX with an enhanced switcher, context badges, and guided onboarding.

## Approach: Surgical Layers

Each layer ships independently. A broken layer doesn't block the others.

### Layer 1: Bug Fix — Add Location Error

**Root cause:** Migration `20260513100000_org_unit_profile_fields.sql` adds columns (`sample_content_urls`, `show_parent_brand`, social URL fields) to `org_units`. The `useCreateOrgUnit` mutationFn in `useOrgData.ts` unconditionally sends these fields with fallback defaults on every insert — `sample_content_urls: input.sample_content_urls ?? []` and `show_parent_brand: input.show_parent_brand ?? true`. Even when `AddEditUnitModal` sends an empty `cloneFields` spread, `useCreateOrgUnit` substitutes defaults for undefined keys. If the migration hasn't been applied to production, the INSERT fails because those columns don't exist.

**Fix:**
- Verify and apply the pending migration to production Supabase.
- Refactor the `mutationFn` inside `useCreateOrgUnit` (not the modal) — build the insert payload by only including optional profile fields when they are explicitly present in the input object (use `Object.hasOwn` or check for `undefined`). Core fields (`name`, `unit_type`, `is_primary`, `org_id`, `address`/`website_url`) are always sent. Profile fields (`description`, `brand_category`, `logo_url`, `sample_content_urls`, `show_parent_brand`, social URLs) are only included when the caller explicitly provides them (i.e., the clone path).
- Improve the error toast in `AddEditUnitModal.tsx` — surface the actual Supabase error message instead of the generic "Please try again."

**Files changed:**
- `src/hooks/useOrgData.ts` — conditional payload construction in `useCreateOrgUnit` mutationFn
- `src/components/org/AddEditUnitModal.tsx` — better error message in catch block

### Layer 2: Location-Scoped Conversations

**Schema:** Add `org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL` to `conversations`. Add index on `org_unit_id`.

**Auto-population:** Two approaches used together:

1. **Database trigger (`SECURITY DEFINER`)** on `conversations` INSERT: if `campaign_id` is set, copy `org_unit_id` from the linked campaign's `campaigns.org_unit_id`. The trigger uses `auth.uid()` to look up `profiles.active_org_unit_id` as a fallback when `campaign_id` is NULL. If `auth.uid()` returns NULL (server-side context), leave `org_unit_id` as NULL.
2. **Explicit parameter on call sites:** The RPC `create_or_get_direct_conversation` (which runs as `SECURITY DEFINER`, making `auth.uid()` potentially unavailable inside the trigger) is updated to accept an optional `p_org_unit_id` parameter and set it on the conversation directly. Similarly, `useCreateCampaignConversation` passes `org_unit_id` explicitly in its insert payload. This is more reliable than relying solely on the trigger.

**Limitation:** Edge Function-created conversations (if any) must pass `org_unit_id` explicitly since `auth.uid()` is not available in service-role context.

**RPC changes:** Drop and recreate `get_user_conversations` with signature `get_user_conversations(user_uuid uuid, p_org_unit_id uuid DEFAULT NULL)`. Both UNION branches must filter: the direct-conversations branch filters `conversations.org_unit_id`, and the campaign-conversations branch filters `campaigns.org_unit_id`. Both use `WHERE (p_org_unit_id IS NULL OR table.org_unit_id = p_org_unit_id)`.

**Hook changes:** `useConversations` accepts optional `orgUnitId` parameter and passes it to the RPC.

**Unread badge behavior:** The bottom nav unread badge always shows total unread count across ALL locations (like email apps show total across all folders). Per-location unread counts are shown inline on the Messages page when a specific location is filtered. This prevents users from missing messages on other locations.

**UI:** When a specific location is active in the switcher, the Messages page shows only that location's conversations. "All Locations" mode shows everything (current behavior).

**Files changed:**
- `supabase/migrations/` — new migration for column + trigger + RPC recreation
- `src/hooks/useConversations.ts` — pass `orgUnitId` to RPC
- `src/hooks/useUnreadCounts.ts` — always use unfiltered count for nav badge

### Layer 3: Location-Scoped Analytics

**Schema:** Add `org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL` to `analytics_events`. Add index.

**Population:** Client-side — the `org_unit_id` must be threaded through the entire analytics pipeline:
1. `useAnalyticsBatch.ts` — extend the `AnalyticsBatchEvent` interface to include `org_unit_id?: string`. Update `addEvent` to accept and store it. Update `flushBatch` to include `org_unit_id` in each `AnalyticsEventInsert` object.
2. The `sendBeacon` fallback path in `useAnalyticsBatch.ts` sends raw JSON directly to Supabase REST — this payload must also include `org_unit_id`.
3. `useAnalytics` and `useOptimizedAnalytics` — pass `activeOrgUnit?.id ?? null` as `org_unit_id` when calling `addEvent`.

No trigger needed; the active location context is already available in the React auth context.

**Hook changes:** Analytics query hooks accept optional `orgUnitId` and filter when set.

**UI:** Dashboard metrics, Dragon Feed, and business activity views filter by active location when one is selected.

**Files changed:**
- `supabase/migrations/` — new migration for column + index
- `src/hooks/useAnalyticsBatch.ts` — extend interface, addEvent, flushBatch, sendBeacon
- `src/hooks/useAnalytics.ts` — pass org_unit_id to addEvent
- `src/hooks/useOptimizedAnalytics.ts` — pass org_unit_id to addEvent

### Layer 4: Location-Scoped File Uploads

**Schema:** Add `org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL` to `file_uploads`. Add index.

**Population:** Database trigger (`SECURITY DEFINER`) on `file_uploads` INSERT:
- If `campaign_id` is set, copy `org_unit_id` from the linked campaign's `campaigns.org_unit_id`.
- Otherwise, look up `profiles.active_org_unit_id` via `auth.uid()` (same pattern as conversations trigger).
- If neither yields a value (server-side context), leave NULL.

**Hook changes:** File query hooks accept optional `orgUnitId` filter.

**UI:** Deliverable views filter by active location. Files with NULL `org_unit_id` remain visible in "All Locations" mode only.

**Files changed:**
- `supabase/migrations/` — new migration for column + index + trigger

### Layer 5: Location-Scoped Dragon Feed

**No schema change.** Dragon Feed aggregates from `analytics_events` and `campaigns`, both of which will have `org_unit_id` after Layers 2–4.

**Hook changes:**
- `useBusinessActivity.ts` — currently takes no arguments and uses internal `useEffect` state management. Needs refactoring to accept an `orgUnitId` parameter and pass it through to its `analytics_events` query.
- `useInspirationStrip.ts` — accepts optional `orgUnitId` and filters its `analytics_events` query.
- Other Dragon Feed hooks — accept optional `orgUnitId` and filter accordingly.

**UI:** When a location is active, the feed shows only that location's activity. "All Locations" shows everything.

**Files changed:**
- `src/hooks/useBusinessActivity.ts` — refactor from effect-based to parameterized hook
- `src/hooks/useInspirationStrip.ts` — add orgUnitId filter
- Any other Dragon Feed hooks that query analytics_events or campaigns

### Layer 6: Rich Location Identity UX

#### Enhanced Switcher (top-right nav)

Upgrade `OrgUnitSwitcher` from a text dropdown to a branded pill:
- Shows location logo (circular, teal ring) or initials fallback inside a teal-bordered pill.
- Active location name displayed next to the avatar.
- Dropdown chevron.

#### Switcher Dropdown (Rich Cards)

When expanded, the dropdown shows:
- **"All Locations"** row with org dragon logo, teal border when active.
- **Location cards** — each shows: circular avatar (logo or initials), location name, quick stats line ("3 campaigns · $1,200/mo" or "0 campaigns · Setup needed"), status badge ("Ready" in green or "Setup" in amber).
- **"+ Add location"** button at bottom with dashed border card.

Status logic:
- **Ready** (green badge): `stripe_onboarding_complete === true` AND at least one row exists in `business_outstand_accounts` where `org_unit_id` matches and the account is connected (OAuth-linked, not just a URL field populated).
- **Setup** (amber badge): either Stripe onboarding incomplete or no OAuth-connected social accounts for this location.

Stats line data source: Reuse the existing `useOrgUnits` query (already fetched for the switcher) combined with a lightweight aggregate query that returns `{ org_unit_id, campaign_count }` grouped by location. Revenue figures are omitted from the dropdown to avoid an expensive query on open — campaign count alone is sufficient context. The aggregate query is cached via React Query with the same staleness as `useOrgUnits`.

#### Context Badge

When a specific location is active, each page title shows a small pill badge: `[South Philly]` in `bg-teal-100 text-teal-800` next to the page heading (stays within the brand teal palette). Hidden when "All Locations" is active or when the org has only one location.

#### Single-Location Simplification

- If org has exactly one location: hide context badge, hide "All Locations" option in switcher, show location name in switcher but without the dropdown toggle.
- "All Locations" and the badge reappear automatically when a second location is created.

### Layer 7: Post-Creation Onboarding & Empty States

#### Post-creation flow

1. After successful location creation, automatically set `active_org_unit_id` to the new location.
2. Redirect to Settings page (location mode) — `LocationSettingsSections` accordion is already built.
3. `ProfileCompletionBar` shows 20% (name done), nudges logo upload next.

#### Empty states (per feature, when location is active but has no data)

| Page | Empty state message | CTA |
|------|-------------------|-----|
| Dashboard | "[Location] is ready for its first campaign" | "Create Campaign" |
| Campaigns | "No campaigns yet for [Location]" | "Launch a Campaign" |
| Messages | "No conversations yet" | None (resolves when campaigns start) |
| Analytics | "Start a campaign to see [Location]'s analytics" | "Create Campaign" |

Empty states use the brand teal accent, not gray. Follow the "no gray in DragonCandy" feedback.

## RLS & Security

No new RLS policies. The existing `org_units` policies use `is_org_owner_or_admin(org_id)` for write operations and `get_user_org_ids()` for reads. The new `org_unit_id` columns are filters within already-authorized data, not new access boundaries. All new columns are nullable with `ON DELETE SET NULL` — removing a location doesn't orphan records.

## Existing Data

Existing rows in `conversations`, `analytics_events`, and `file_uploads` retain `org_unit_id = NULL` after migration. These rows remain visible only in "All Locations" mode. No backfill is needed given the current user count (~30 organic users, pre-revenue). For conversations that already have a `campaign_id` pointing to a campaign with `org_unit_id` set, an optional backfill UPDATE can be run post-migration to populate their `org_unit_id` — but this is a nice-to-have, not a requirement.

## Migration Safety

All schema changes are additive (`ADD COLUMN IF NOT EXISTS`, nullable). No columns renamed or dropped. Each layer gets its own timestamped migration file. Triggers use `SECURITY DEFINER` to bypass RLS for auto-population.

## Data Model Summary

```
organizations (1)
  └── org_units (many) — locations or products
        ├── campaigns.org_unit_id ✅ (exists)
        ├── conversations.org_unit_id (new)
        ├── analytics_events.org_unit_id (new)
        ├── file_uploads.org_unit_id (new)
        ├── business_outstand_accounts.org_unit_id ✅ (exists)
        └── dragonshare_posts.target_org_unit_id ✅ (exists)
```

## What This Deletes

- Generic "Something went wrong" error messages.
- The concept of "global-only" features — every feature works the same way when you switch locations.
- Confusion about which location you're working in.
- The "what do I do next?" moment after creating a location.

## What This Simplifies

- Create flow sends only the fields the user filled in (no unnecessary payload).
- One consistent pattern across all features: active location filters data, "All Locations" shows everything.
- Single-location orgs get a simplified UI with no switcher noise.

## What This Automates

- `org_unit_id` population via triggers and context inheritance (zero extra taps).
- Active location switch on creation (auto-redirect to settings).
- Progressive identity upgrade (initials → logo as profile completes).
