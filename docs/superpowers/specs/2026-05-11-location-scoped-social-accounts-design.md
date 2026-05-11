# Location-Scoped Social Media Accounts

**Date:** 2026-05-11
**Status:** Approved design, pending implementation

## Problem

Social media accounts connected via Outstand are keyed on `user_id` — all locations under a restaurant or brand share the same pool of connected accounts. A restaurant chain with three locations and three separate Instagram handles has no way to associate each handle with its location. Campaigns post to whichever account the hook finds first, not the one belonging to the campaign's location.

## Scope

**In scope:**

- Add `org_unit_id` to `business_outstand_accounts` table
- Outstand proxy reads active org unit from frontend, tags connections accordingly
- AccountsTab filters accounts by active location; hides connect UI in "All Locations" mode
- One-time reassignment prompt for existing unassigned accounts
- Reassign (move) accounts between locations from "All Locations" view
- Campaign social hooks filter accounts by campaign's `org_unit_id`
- Disconnect and replace accounts per location (existing flow, no new API)

**Out of scope:**

- Multi-location sharing (one account connected to multiple locations)
- Creator-side location scoping (creators don't have org units)
- Outstand posting queue scoped by location (Outstand manages this org-wide)

## Approach

Add a nullable `org_unit_id` FK to the existing `business_outstand_accounts` table. The frontend sends the active org unit via an `X-Org-Unit-Id` header on every Outstand proxy request. The proxy includes it in connection upserts and uses it to filter account lookups. Existing accounts with NULL `org_unit_id` trigger a one-time reassignment prompt on the social management page.

## Design

### 1. Schema — Add org_unit_id Column

**Table:** `business_outstand_accounts`

Add column:
```sql
ALTER TABLE public.business_outstand_accounts
  ADD COLUMN org_unit_id UUID REFERENCES public.org_units(id) ON DELETE SET NULL;

CREATE INDEX idx_business_outstand_accounts_org_unit
  ON public.business_outstand_accounts(org_unit_id);
```

The unique constraint stays `(user_id, outstand_social_account_id)` — one account belongs to exactly one location, so the account ID itself guarantees uniqueness regardless of which org unit it's under.

**Reconnect behavior:** If an account is disconnected (`status: 'revoked'`) from one location and later reconnected to a different location, the upsert overwrites the existing row (same `user_id + outstand_social_account_id`), updating its `org_unit_id`, `status`, and `connected_at`. This is intentional — the account moves to the new location cleanly.

`ON DELETE SET NULL` is a safety net for hard deletes, but `org_units` uses soft deletes (`deleted_at` column) in practice — rows are never actually removed. This means the FK constraint won't fire during normal operation. To handle soft-deleted org units, the unassigned-accounts query (Section 7) must also match accounts whose `org_unit_id` references an org unit with `deleted_at IS NOT NULL`. This catches both truly unassigned accounts (NULL) and accounts orphaned by a soft-deleted location.

### 2. Outstand Proxy — Location Context

**File:** `supabase/functions/outstand-proxy/index.ts`

**TenantContext** gains `orgUnitId`:
```typescript
interface TenantContext {
  userId: string;
  businessId: string | null;
  orgUnitId: string | null;
}
```

**`resolveTenant`** reads the `X-Org-Unit-Id` header:
```typescript
const orgUnitId = req.headers.get('x-org-unit-id') || null;
// ... existing user/business resolution ...
return { userId, businessId, orgUnitId };
```

The `x-org-unit-id` header should be read in the main `serve` handler (consistent with how `x-delegated-account-id` and `x-delegated-user-id` are already read at lines 468-469) and passed as a string parameter to `resolveTenant`. This avoids threading the full `Request` object through. Update `resolveTenant` signature to `(authHeader: string, admin: SupabaseClient, orgUnitId: string | null)`.

**`listOwnedAccountIds`** accepts optional `orgUnitId`:
- When non-null: add `.eq('org_unit_id', orgUnitId)` — only return accounts for the active location
- When null: return all active accounts for the user (current behavior)

This scopes the Outstand SDK's `AccountsList` to the active location automatically, since the proxy filters the `/social-accounts` response to only include owned IDs.

**`recordConnectionFromAuthResponse`** includes `org_unit_id: ctx.orgUnitId` in each upsert payload. New connections are tagged to the active location.

**`handleRecordConnection`** includes `org_unit_id` from either the request body (`body.org_unit_id`) or `ctx.orgUnitId`. The OAuth callback page sends it in the POST body. The proxy includes it in the upsert. If null, the account is created as unassigned.

**Pre-existing bug fix:** `handleRecordConnection` currently uses `{ onConflict: "business_id,outstand_social_account_id" }`, but the unique constraint was migrated to `(user_id, outstand_social_account_id)` in `20260507000000_outstand_account_links_creator_support.sql`. Fix the `onConflict` key to `"user_id,outstand_social_account_id"` to match the current constraint (consistent with `recordConnectionFromAuthResponse` which already uses the correct key).

**CORS headers:** Update `corsHeaders['Access-Control-Allow-Headers']` to include `x-org-unit-id` (and `x-delegated-account-id`, `x-delegated-user-id` which have the same latent CORS issue). Without this, browsers will reject the custom header on preflight.

**`recordDisconnect`** — no changes. It matches on `user_id + outstand_social_account_id` which is unique. Works regardless of location context.

### 3. Frontend — Outstand Provider

**File:** `src/integrations/outstand/Provider.tsx`

The `useOutstandConfig` hook currently returns `{ apiKey, baseUrl }`. It needs to inject the `X-Org-Unit-Id` header into every request the Outstand SDK makes.

The Outstand SDK's `ConnectAccountButtonGroup` and `AccountsList` components accept `apiKey` and `baseUrl` and use `fetch` internally. They don't support custom headers directly.

**Solution — dual approach:** The org unit ID is delivered to the proxy via two parallel mechanisms, ensuring it arrives regardless of how the request originates:

1. **Query parameter on `baseUrl`:** `useOutstandConfig` appends `?org_unit_id={id}` to the proxy base URL when `activeOrgUnit` is non-null (e.g., `https://.../outstand-proxy?org_unit_id=abc-123`). The Outstand SDK constructs full URLs by appending paths to `baseUrl`, so the query param survives as long as paths are appended (e.g., `/social-accounts` becomes `baseUrl + /social-accounts`). The proxy reads `org_unit_id` from query params via `url.searchParams.get('org_unit_id')`.

2. **Custom header for direct fetch calls:** For non-SDK requests (the `/__internal/record-connection` POST, the custom accounts list query, the reassignment mutation), the frontend includes `X-Org-Unit-Id` as a header directly since these calls are made via `fetch` or Supabase client, not the Outstand SDK.

The proxy reads the org unit from query params first, then falls back to the `X-Org-Unit-Id` header: `const orgUnitId = url.searchParams.get('org_unit_id') || req.headers.get('x-org-unit-id') || null;`

During implementation, verify that `@outstand-so/ui` preserves query params when constructing URLs from `baseUrl`. If it strips them (unlikely but possible), fall back to a scoped `globalThis.fetch` wrapper within the `DragonCandyOutstandProvider` that injects the header on all requests matching the proxy URL prefix.

### 4. Frontend — AccountsTab

**File:** `src/components/outstand/AccountsTab.tsx`

Read `activeOrgUnit` from `useAuth()`. Three rendering modes:

**Specific location selected (`activeOrgUnit` is non-null):**
- Show "Connect a network" card (existing `ConnectAccountButtonGroup`)
- Show "Connected accounts" card (existing `AccountsList` — proxy filters to this location)
- Before initiating OAuth, stash `activeOrgUnit.id` in `sessionStorage` as `outstand_pending_org_unit_id`

**All Locations mode (`activeOrgUnit` is null):**
- Hide the "Connect a network" card. Show a muted info message: "Switch to a specific location to connect new accounts."
- Replace the Outstand SDK's `AccountsList` with a custom list component that queries `business_outstand_accounts` directly (via a new React Query hook), grouped or badged by org unit name. Each row shows: platform icon, handle, location badge, disconnect button, and a "Change location" dropdown.
- Disconnect calls the existing proxy `DELETE /social-accounts/{id}` endpoint (works regardless of location filter).

**Unassigned accounts exist (any mode):**
- Query `business_outstand_accounts` for rows where `org_unit_id IS NULL AND status = 'active'`.
- If any exist, render a reassignment card at the top of the page with a yellow/amber border.
- Each unassigned account shows: platform icon, handle, and a location dropdown populated from `useOrgUnits`.
- A "Save assignments" button updates `org_unit_id` for each account via `supabase.from('business_outstand_accounts').update({ org_unit_id }).eq('id', accountId)`.
- Once all accounts are assigned, the card disappears (query returns empty).

### 5. Frontend — OAuth Callback

**File:** `src/pages/OutstandOAuthCallbackPage.tsx`

**One-step callback (`OneStepCallback`):**
- Read `outstand_pending_org_unit_id` from `sessionStorage` (stashed by `AccountsTab` before OAuth redirect).
- Clear it from sessionStorage after reading.
- Include `org_unit_id` in the POST body to `/__internal/record-connection`:
  ```typescript
  body: JSON.stringify({ account_id: accountId, network, username, org_unit_id: orgUnitId })
  ```

**SDK callback (`OAuthCallback`):**
- The SDK's `OAuthCallback` component calls `POST /social-accounts/pending/{session}/finalize` internally.
- The proxy reads `X-Org-Unit-Id` from the header (injected by the Provider).
- `recordConnectionFromAuthResponse` includes `org_unit_id: ctx.orgUnitId` in the upsert.

### 6. Campaign Social Hooks

**File:** `supabase/functions/fire-campaign-social-hook/index.ts`

The campaign query's `.select()` currently fetches `'id, title, user_id, status'` — update it to include `org_unit_id`: `.select('id, title, user_id, status, org_unit_id')`.

The account lookup currently queries:
```typescript
.from('business_outstand_accounts')
.select('platform, platform_handle')
.eq('user_id', party.user_id)
.limit(1);
```

Update to also filter by the campaign's org_unit_id when available:
```typescript
let query = supabase
  .from('business_outstand_accounts')
  .select('platform, platform_handle')
  .eq('user_id', party.user_id)
  .eq('status', 'active');

if (campaign.org_unit_id) {
  query = query.eq('org_unit_id', campaign.org_unit_id);
}

const { data: outstandAccounts } = await query.limit(1);
```

The campaign's `org_unit_id` is already populated (from the multi-location scoping work done earlier). This ensures a Hoboken campaign picks up Hoboken's Instagram, not a different location's.

### 7. New Hook — useLocationSocialAccounts

**File:** `src/hooks/outstand/useLocationSocialAccounts.ts`

A new React Query hook for the "All Locations" custom accounts list and the reassignment card:

```typescript
function useLocationSocialAccounts(userId?: string, orgUnitId?: string | null)
```

- Queries `business_outstand_accounts` joined with `org_units` (for the location name)
- When `orgUnitId` is non-null, filters to that location
- When null, returns all active accounts with their org unit names
- Query key: `['location-social-accounts', userId, orgUnitId ?? 'all']`
- Returns: `{ data: Array<{ id, platform, platform_handle, org_unit_id, org_unit_name, status }>, isLoading }`

A second hook or filter for unassigned accounts:

```typescript
function useUnassignedSocialAccounts(userId?: string)
```

- Queries accounts that need reassignment: `status = 'active'` AND either `org_unit_id IS NULL` or the referenced org unit has `deleted_at IS NOT NULL` (soft-deleted location). Use a left join on `org_units` to detect this: select accounts where `org_unit_id IS NULL OR org_units.deleted_at IS NOT NULL`.
- Query key: `['unassigned-social-accounts', userId]`

### 8. Reassignment Mutation

**File:** `src/hooks/outstand/useAssignAccountLocation.ts`

A mutation hook that updates `org_unit_id` for one or more accounts:

```typescript
function useAssignAccountLocation()
```

- Accepts `Array<{ accountId: string, orgUnitId: string }>`
- Runs individual `supabase.from('business_outstand_accounts').update({ org_unit_id }).eq('id', accountId)` calls wrapped in `Promise.all` for concurrency (each account may go to a different location, so a single batch update isn't possible)
- Invalidates `['location-social-accounts']` and `['unassigned-social-accounts']` query keys on success

This serves both the one-time migration prompt and the ongoing "Change location" action in the All Locations view.

## What This Deletes

- The assumption that all locations share one pool of social accounts

## What This Simplifies

- Campaign social posts: each campaign's location determines which social accounts to use
- Account management: each location manages its own connections independently

## What This Automates

- Location tagging on social account connection (inherits from active location in switcher)
- Campaign-to-account matching (filtered by `org_unit_id` automatically)

## Keystroke Count Removed

Social account connection: 0 additional keystrokes (location inherited from switcher). Campaign social hook: 0 keystrokes (automatic location match). One-time reassignment of existing accounts: ~N clicks where N is number of existing accounts (one dropdown selection per account + one save button).

## Files Modified

| File | Change |
|------|--------|
| SQL migration | Add `org_unit_id` column + index to `business_outstand_accounts` |
| `supabase/functions/outstand-proxy/index.ts` | Add `orgUnitId` to TenantContext, read from header, include in upserts, filter `listOwnedAccountIds` |
| `src/integrations/outstand/Provider.tsx` | Inject active org unit into proxy requests |
| `src/components/outstand/AccountsTab.tsx` | Location-aware rendering, hide connect in All Locations, reassignment card |
| `src/pages/OutstandOAuthCallbackPage.tsx` | Stash/read org unit ID through OAuth flow |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Filter accounts by campaign's `org_unit_id` |
| `src/hooks/outstand/useLocationSocialAccounts.ts` | New hook: query accounts with location join |
| `src/hooks/outstand/useAssignAccountLocation.ts` | New hook: mutation to assign/reassign accounts to locations |
| `src/integrations/supabase/types.ts` | Regenerate after migration to include `org_unit_id` on `business_outstand_accounts` type |
