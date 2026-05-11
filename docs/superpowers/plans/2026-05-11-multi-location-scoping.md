# Multi-Location Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the location switcher functional — switching locations scopes campaigns, dashboard metrics, and creation to the active org unit.

**Architecture:** Thread `activeOrgUnit?.id` from AuthContext through campaign hooks as a query parameter. React Query keys include the unit ID so switching triggers automatic refetch. Campaign creation auto-tags with the active unit. An "All Locations" option clears the filter. No DB migrations needed — `campaigns.org_unit_id` already exists.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase JS v2, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-11-multi-location-scoping-design.md`

---

### Task 1: AuthContext — Accept null in switchOrgUnit

**Files:**
- Modify: `src/contexts/AuthContext.tsx:33` (type signature), `src/contexts/AuthContext.tsx:211-225` (function body)

- [ ] **Step 1: Update the type signature**

In `AuthContextType` interface (line 33), change:
```typescript
switchOrgUnit: (unitId: string) => Promise<void>;
```
to:
```typescript
switchOrgUnit: (unitId: string | null) => Promise<void>;
```

- [ ] **Step 2: Update the function implementation**

Replace the `switchOrgUnit` function (lines 211–225) with:
```typescript
const switchOrgUnit = async (unitId: string | null) => {
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ active_org_unit_id: unitId })
    .eq('id', user.id);
  if (error) throw error;

  if (unitId) {
    const { data: unit } = await supabase
      .from('org_units')
      .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at')
      .eq('id', unitId)
      .maybeSingle();
    setActiveOrgUnit(unit as OrgUnit | null);
  } else {
    setActiveOrgUnit(null);
  }
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: accept null in switchOrgUnit for All Locations mode"
```

---

### Task 2: OrgUnitSwitcher — Add "All Locations" entry

**Files:**
- Modify: `src/components/org/OrgUnitSwitcher.tsx`

- [ ] **Step 1: Add Globe import**

At line 2, add `Globe` to the lucide-react import:
```typescript
import { Check, ChevronDown, MapPin, Tag, Plus, Search, Globe } from 'lucide-react';
```

- [ ] **Step 2: Replace useUpdateActiveUnit with switchOrgUnit from AuthContext**

Replace line 7:
```typescript
import { useOrgUnits, useUpdateActiveUnit } from '@/hooks/useOrgData';
```
with:
```typescript
import { useOrgUnits } from '@/hooks/useOrgData';
```

In the component body, replace:
```typescript
const { data: units = [] } = useOrgUnits(activeOrg?.id);
const updateActive = useUpdateActiveUnit();
```
with:
```typescript
const { data: units = [] } = useOrgUnits(activeOrg?.id);
const { switchOrgUnit } = useAuth();
```

(The `useAuth` import already exists on line 6.)

- [ ] **Step 3: Remove the early return for null activeOrgUnit**

Replace line 65:
```typescript
if (!activeOrg || !activeOrgUnit) return null;
```
with:
```typescript
if (!activeOrg) return null;
```

- [ ] **Step 4: Update the trigger button to handle null state**

Replace the trigger button label (line 104–106):
```typescript
<OrgIcon className="w-3.5 h-3.5 shrink-0" />
<span className="text-sm font-medium max-w-[120px] truncate">{activeOrgUnit.name}</span>
```
with:
```typescript
{activeOrgUnit ? (
  <OrgIcon className="w-3.5 h-3.5 shrink-0" />
) : (
  <Globe className="w-3.5 h-3.5 shrink-0" />
)}
<span className="text-sm font-medium max-w-[120px] truncate">
  {activeOrgUnit?.name ?? (isRestaurant ? 'All Locations' : 'All Products')}
</span>
```

- [ ] **Step 5: Add "All" entry above the unit list**

Inside the `<div className="max-h-60 overflow-y-auto">` block (line 123), before the `filteredUnits.length === 0` check, add the "All" entry:

```typescript
<div className="max-h-60 overflow-y-auto">
  <button
    type="button"
    onClick={() => handleSelect(null)}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-50 transition-colors text-left"
  >
    <Globe className="w-6 h-6 text-teal-500 shrink-0" />
    <span className="flex-1 text-sm font-medium text-gray-800">
      {isRestaurant ? 'All Locations' : 'All Products'}
    </span>
    {!activeOrgUnit && <Check className="w-4 h-4 text-teal-500 shrink-0" />}
  </button>
  <div className="border-b border-gray-100 my-1" />
  {filteredUnits.length === 0 ? (
```

- [ ] **Step 6: Update handleSelect to accept null and use switchOrgUnit**

Replace the `handleSelect` function (lines 76–87):
```typescript
const handleSelect = async (unit: OrgUnit) => {
  if (unit.id === activeOrgUnit.id) {
    setOpen(false);
    return;
  }
  try {
    await updateActive.mutateAsync(unit.id);
  } finally {
    setOpen(false);
    setSearch('');
  }
};
```
with:
```typescript
const handleSelect = async (unit: OrgUnit | null) => {
  const selectedId = unit?.id ?? null;
  const currentId = activeOrgUnit?.id ?? null;
  if (selectedId === currentId) {
    setOpen(false);
    return;
  }
  try {
    await switchOrgUnit(selectedId);
  } finally {
    setOpen(false);
    setSearch('');
  }
};
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/org/OrgUnitSwitcher.tsx
git commit -m "feat: add All Locations entry to OrgUnitSwitcher"
```

---

### Task 3: Campaign interface and useCampaignQueries — Add org_unit_id filtering

**Files:**
- Modify: `src/hooks/useCampaignQueries.ts:34-75` (Campaign interface), `src/hooks/useCampaignQueries.ts:77-103` (useCampaignsList)

- [ ] **Step 1: Add org_unit_id to Campaign interface**

In the `Campaign` interface (after `user_id: string;` at line 35), add:
```typescript
org_unit_id?: string | null;
```

- [ ] **Step 2: Add org_unit_id to the select field lists**

In `useCampaignsList` (line 85), add `org_unit_id` to the `.select()` string. After `user_id,` insert `org_unit_id,`:
```typescript
.select('id, user_id, org_unit_id, title, description, goals, deliverables, platforms, budget_min, budget_max, deadline, status, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, escrow_status, escrow_payment_intent_id, ai_analysis, ai_preview_status, created_at, updated_at');
```

Do the same for `useCampaignById` (line 111) — add `org_unit_id` after `user_id,`.

- [ ] **Step 3: Add orgUnitId parameter to useCampaignsList**

Change the function signature (line 77) from:
```typescript
export const useCampaignsList = (filterByOwnership: boolean = true) => {
```
to:
```typescript
export const useCampaignsList = (filterByOwnership: boolean = true, orgUnitId?: string | null) => {
```

Update the query key (line 81) from:
```typescript
queryKey: ['campaigns', user?.id, filterByOwnership],
```
to:
```typescript
queryKey: ['campaigns', user?.id, filterByOwnership, orgUnitId ?? 'all'],
```

After the ownership filter block (after line 90), add the location filter:
```typescript
if (orgUnitId) {
  query = query.eq('org_unit_id', orgUnitId);
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCampaignQueries.ts
git commit -m "feat: add org_unit_id to Campaign interface and useCampaignsList filter"
```

---

### Task 4: useCampaigns wrapper — Pass orgUnitId through

**Files:**
- Modify: `src/hooks/useCampaigns.tsx`

- [ ] **Step 1: Update useCampaigns to accept and pass orgUnitId**

Change line 8:
```typescript
export const useCampaigns = (filterByOwnership: boolean = true) => {
```
to:
```typescript
export const useCampaigns = (filterByOwnership: boolean = true, orgUnitId?: string | null) => {
```

Change line 9:
```typescript
const { data: campaigns, isLoading, error } = useCampaignsList(filterByOwnership);
```
to:
```typescript
const { data: campaigns, isLoading, error } = useCampaignsList(filterByOwnership, orgUnitId);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaigns.tsx
git commit -m "feat: pass orgUnitId through useCampaigns wrapper"
```

---

### Task 5: useBusinessActiveCampaigns — Add location filter

**Files:**
- Modify: `src/hooks/useBusinessActiveCampaigns.ts`

- [ ] **Step 1: Add orgUnitId parameter**

Change line 14:
```typescript
export function useBusinessActiveCampaigns() {
```
to:
```typescript
export function useBusinessActiveCampaigns(orgUnitId?: string | null) {
```

- [ ] **Step 2: Update query key**

Change line 18:
```typescript
queryKey: ['business_active_campaigns', user?.id],
```
to:
```typescript
queryKey: ['business_active_campaigns', user?.id, orgUnitId ?? 'all'],
```

- [ ] **Step 3: Add location filter to query**

After line 25 (`.eq('user_id', user.id)`), before `.in('status', ...)`, add:
```typescript
if (orgUnitId) {
  campaignQuery = campaignQuery.eq('org_unit_id', orgUnitId);
}
```

Note: The query is built inline, so you'll need to extract it into a variable. Replace lines 22–29:
```typescript
const { data: campaigns, error } = await supabase
  .from('campaigns')
  .select('id, title, status, deadline')
  .eq('user_id', user.id)
  .in('status', ['draft', 'published', 'active'])
  .order('created_at', { ascending: false })
  .limit(5);
```
with:
```typescript
let campaignQuery = supabase
  .from('campaigns')
  .select('id, title, status, deadline')
  .eq('user_id', user.id)
  .in('status', ['draft', 'published', 'active']);

if (orgUnitId) {
  campaignQuery = campaignQuery.eq('org_unit_id', orgUnitId);
}

const { data: campaigns, error } = await campaignQuery
  .order('created_at', { ascending: false })
  .limit(5);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBusinessActiveCampaigns.ts
git commit -m "feat: add orgUnitId filter to useBusinessActiveCampaigns"
```

---

### Task 6: useBrandActiveCampaigns — Add location filter

**Files:**
- Modify: `src/hooks/useBrandActiveCampaigns.ts`

- [ ] **Step 1: Add orgUnitId parameter**

Change line 14:
```typescript
export function useBrandActiveCampaigns() {
```
to:
```typescript
export function useBrandActiveCampaigns(orgUnitId?: string | null) {
```

- [ ] **Step 2: Update query key**

Change line 18:
```typescript
queryKey: ['brand_active_campaigns', user?.id],
```
to:
```typescript
queryKey: ['brand_active_campaigns', user?.id, orgUnitId ?? 'all'],
```

- [ ] **Step 3: Add location filter to own campaigns query**

Replace lines 23–29:
```typescript
const { data: ownCampaigns, error: ownError } = await supabase
  .from('campaigns')
  .select('id, title, status, deadline')
  .eq('user_id', user.id)
  .in('status', ['published', 'active'])
  .order('created_at', { ascending: false })
  .limit(5);
```
with:
```typescript
let ownQuery = supabase
  .from('campaigns')
  .select('id, title, status, deadline')
  .eq('user_id', user.id)
  .in('status', ['published', 'active']);

if (orgUnitId) {
  ownQuery = ownQuery.eq('org_unit_id', orgUnitId);
}

const { data: ownCampaigns, error: ownError } = await ownQuery
  .order('created_at', { ascending: false })
  .limit(5);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrandActiveCampaigns.ts
git commit -m "feat: add orgUnitId filter to useBrandActiveCampaigns"
```

---

### Task 7: useBusinessDashboardMetrics — Add location filter

**Files:**
- Modify: `src/hooks/useBusinessDashboardMetrics.ts`

- [ ] **Step 1: Add orgUnitId parameter**

Change line 20:
```typescript
export function useBusinessDashboardMetrics() {
```
to:
```typescript
export function useBusinessDashboardMetrics(orgUnitId?: string | null) {
```

- [ ] **Step 2: Update query key**

Change line 24:
```typescript
queryKey: ['business_dashboard_metrics', user?.id],
```
to:
```typescript
queryKey: ['business_dashboard_metrics', user?.id, orgUnitId ?? 'all'],
```

- [ ] **Step 3: Add location filter to active campaigns count**

Replace lines 29–33:
```typescript
const { count: activeCount, error: activeError } = await supabase
  .from('campaigns')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .in('status', ['active', 'published']);
```
with:
```typescript
let activeQuery = supabase
  .from('campaigns')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .in('status', ['active', 'published']);

if (orgUnitId) {
  activeQuery = activeQuery.eq('org_unit_id', orgUnitId);
}

const { count: activeCount, error: activeError } = await activeQuery;
```

- [ ] **Step 4: Add location filter to pending content query**

The pending content query joins through `campaigns!inner(user_id)`. To filter by org_unit_id, update lines 38–42:
```typescript
const { data: pendingCollabs, error: pendingError } = await supabase
  .from('campaign_collaborations')
  .select('id, campaigns!inner(user_id)')
  .eq('campaigns.user_id', user.id)
  .eq('status', 'active');
```
to:
```typescript
let pendingQuery = supabase
  .from('campaign_collaborations')
  .select('id, campaigns!inner(user_id, org_unit_id)')
  .eq('campaigns.user_id', user.id)
  .eq('status', 'active');

if (orgUnitId) {
  pendingQuery = pendingQuery.eq('campaigns.org_unit_id', orgUnitId);
}

const { data: pendingCollabs, error: pendingError } = await pendingQuery;
```

- [ ] **Step 5: Add location filter to spend query**

Similarly update lines 47–50:
```typescript
const { data: acceptedApps, error: spendError } = await supabase
  .from('campaign_applications')
  .select('proposed_rate, campaigns!inner(user_id)')
  .eq('campaigns.user_id', user.id)
  .eq('status', 'accepted');
```
to:
```typescript
let spendQuery = supabase
  .from('campaign_applications')
  .select('proposed_rate, campaigns!inner(user_id, org_unit_id)')
  .eq('campaigns.user_id', user.id)
  .eq('status', 'accepted');

if (orgUnitId) {
  spendQuery = spendQuery.eq('campaigns.org_unit_id', orgUnitId);
}

const { data: acceptedApps, error: spendError } = await spendQuery;
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBusinessDashboardMetrics.ts
git commit -m "feat: add orgUnitId filter to useBusinessDashboardMetrics"
```

---

### Task 8: Campaign creation — Auto-tag with org_unit_id

**Files:**
- Modify: `src/hooks/useCampaignMutations.ts:10-31` (interface), `src/hooks/useCampaignMutations.ts:33-44` (hook)

- [ ] **Step 1: Add org_unit_id to CreateCampaignData**

In the `CreateCampaignData` interface (after `ai_analysis` at line 30), add:
```typescript
org_unit_id?: string | null;
```

- [ ] **Step 2: Add activeOrgUnit to useCreateCampaign**

In `useCreateCampaign` (line 34), add `activeOrgUnit` to the destructured auth:
```typescript
const { user, activeOrgUnit } = useAuth();
```

- [ ] **Step 3: Include org_unit_id in the insert payload**

Replace lines 39–44:
```typescript
mutationFn: async (campaignData: CreateCampaignData) => {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      ...campaignData,
      user_id: user!.id,
    } as unknown as Database['public']['Tables']['campaigns']['Insert'])
```
with:
```typescript
mutationFn: async (campaignData: CreateCampaignData) => {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      ...campaignData,
      user_id: user!.id,
      org_unit_id: campaignData.org_unit_id ?? activeOrgUnit?.id ?? null,
    } as unknown as Database['public']['Tables']['campaigns']['Insert'])
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCampaignMutations.ts
git commit -m "feat: auto-tag campaigns with active org_unit_id on creation"
```

---

### Task 9: Campaign duplication — Preserve org_unit_id

**Files:**
- Modify: `src/hooks/useCampaignMutations.ts:466-504` (useDuplicateCampaign)

- [ ] **Step 1: Add org_unit_id to the source select**

In `useDuplicateCampaign` (line 474), add `org_unit_id` to the `.select()` string:
```typescript
.select('title, description, goals, deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis, org_unit_id')
```

The spread (`...source`) in the insert (line 483) already includes all selected fields, so `org_unit_id` is automatically carried over.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignMutations.ts
git commit -m "feat: preserve org_unit_id when duplicating campaigns"
```

---

### Task 10: Creation guard and org_unit_id in campaign payload

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx`

The campaign finalize step has two code paths: create (via `useCreateCampaign` mutation) and update existing draft (via direct `supabase.update()`). Both paths must include `org_unit_id`, and the guard must fire before either.

- [ ] **Step 1: Add activeOrgUnit to the component**

At the top of the component (near the `useCampaigns` call around line 78), add `activeOrgUnit` from auth context:
```typescript
const { activeOrgUnit } = useAuth();
```
(Add the import for `useAuth` from `@/hooks/useAuth` if not already imported.)

- [ ] **Step 2: Add the guard at the top of handleCreateCampaign**

At the top of the `handleCreateCampaign` function body (after initial variable declarations, before the `wantToPublish` logic around line 150), add:
```typescript
if (!activeOrgUnit) {
  toast({
    title: 'Select a location first',
    description: 'Switch to a specific location before creating a campaign.',
    variant: 'destructive',
  });
  setIsPublishing(false);
  return;
}
```

This fires before both the create and draft-update branches.

- [ ] **Step 3: Include org_unit_id in campaignPayload**

In the `campaignPayload` object (around line 171), add `org_unit_id` alongside the other fields:
```typescript
const campaignPayload = {
  title: data.title,
  description: data.description,
  // ... existing fields ...
  org_unit_id: activeOrgUnit.id,
};
```

This ensures both the create mutation AND the direct `supabase.update()` draft path receive the org_unit_id.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "feat: guard campaign creation and tag with org_unit_id"
```

---

### Task 11: Business Dashboard — Pass location to hooks

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`

Note: `ActiveCampaignsFeed` and `BusinessStatsRow` exist but are not rendered by either dashboard — `BusinessDashboard.tsx` calls `useBusinessActiveCampaigns` directly and renders campaigns inline. No changes needed for those orphaned components.

- [ ] **Step 1: Update BusinessDashboard to pass orgUnitId**

In `BusinessDashboard` (line 30), change:
```typescript
const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns();
```
to:
```typescript
const { activeOrgUnit } = useAuth();
const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns(activeOrgUnit?.id);
```

(`useAuth` is already imported on line 3.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BusinessDashboard.tsx
git commit -m "feat: pass orgUnitId to business dashboard campaign hooks"
```

---

### Task 12: Brand Dashboard — Pass location to hooks

**Files:**
- Modify: `src/pages/BrandDashboard.tsx`

- [ ] **Step 1: Pass orgUnitId to useBrandActiveCampaigns**

In `BrandDashboard` (line 33), change:
```typescript
const { data: campaigns, isLoading: campaignsLoading } = useBrandActiveCampaigns();
```
to:
```typescript
const { activeOrgUnit } = useAuth();
const { data: campaigns, isLoading: campaignsLoading } = useBrandActiveCampaigns(activeOrgUnit?.id);
```

(`useAuth` is already imported on line 2.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BrandDashboard.tsx
git commit -m "feat: pass orgUnitId to brand dashboard campaign hooks"
```

---

### Task 13: Campaigns list page — Pass location filter

**Files:**
- Modify: `src/components/campaigns/CampaignsList.tsx`

The `CampaignsList` component calls `useCampaigns(filterByOwnership)` which feeds into `useCampaignsList`. It needs the location filter so the "View all campaigns" page respects the active location.

- [ ] **Step 1: Add activeOrgUnit and pass orgUnitId**

In `CampaignsList`, add `activeOrgUnit` from auth context and pass it through:

Add import:
```typescript
import { useAuth } from '@/hooks/useAuth';
```

In the component body, change:
```typescript
const { campaigns, isLoading, error } = useCampaigns(filterByOwnership);
```
to:
```typescript
const { activeOrgUnit } = useAuth();
const { campaigns, isLoading, error } = useCampaigns(filterByOwnership, activeOrgUnit?.id);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignsList.tsx
git commit -m "feat: pass orgUnitId to campaigns list page"
```

---

### Task 14: Backfill existing campaigns via SQL migration

**Files:**
- Run SQL migration via Supabase MCP

- [ ] **Step 1: Run the backfill migration**

Execute this SQL via `mcp__plugin_supabase_supabase__execute_sql`:

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

- [ ] **Step 2: Verify the backfill**

Run a verification query:
```sql
SELECT
  count(*) AS total,
  count(org_unit_id) AS with_unit,
  count(*) - count(org_unit_id) AS without_unit
FROM campaigns;
```

Expected: `without_unit` should be 0 or a small number (campaigns from users without an org/primary unit).

- [ ] **Step 3: Commit migration record**

No local migration file needed — this is a one-time data fix. Document in the commit message.

```bash
git commit --allow-empty -m "chore: backfill campaigns.org_unit_id to primary org unit (run via Supabase SQL)"
```

---

### Task 15: Manual QA — Verify end-to-end

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Test location switching**

1. Log in as a restaurant/brand user with multiple locations
2. Verify the OrgUnitSwitcher shows "All Locations" at the top
3. Switch to a specific location — verify dashboard campaigns and metrics filter
4. Switch to "All Locations" — verify all campaigns appear
5. Switch between locations — verify React Query refetches (no stale data)

- [ ] **Step 3: Test campaign creation**

1. Switch to a specific location
2. Create a campaign — verify it appears under that location (check DB: `campaigns.org_unit_id` matches)
3. Switch to "All Locations" and try to create — verify the guard toast appears

- [ ] **Step 4: Test campaign duplication**

1. Duplicate a campaign
2. Verify the duplicate inherits the source campaign's `org_unit_id`

- [ ] **Step 5: Test brand dashboard**

1. Log in as a brand user
2. Verify the location switcher works on the brand dashboard
3. Verify brand campaigns filter by location

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.
