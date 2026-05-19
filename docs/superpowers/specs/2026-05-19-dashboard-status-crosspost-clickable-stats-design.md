# Dashboard Status Sync, Cross-Post Fix, Clickable Stats

**Date:** 2026-05-19
**Status:** Draft

## Context

Three production bugs/gaps reported from the Restaurant (Harbormill) account:

1. The "Opening Night Takeover" campaign shows "Campaign Completed" on its detail page but "Published" on the Dashboard activity feed and Campaigns page. The `@Roger` creator name below the campaign title on the Dashboard is wrong — the actual assigned creator is "Ricky Ricardo."
2. Clicking "Post Now" in the Cross-Post to Your Socials dialog produces "Cross-post failed: The string did not match the expected pattern." Scheduling is also broken via the Donny draft publish flow.
3. Dashboard stat cards (Active, Creators, Spend, ROI) are not clickable on any role's dashboard.

All three issues affect Restaurant and Brand roles. Issue 3 also affects the Creator dashboard.

---

## Issue 1: Campaign Status Mismatch + Wrong Creator Name

### Root Cause

The campaign detail page derives display status via `deriveCampaignPhase()` in `src/lib/campaignPhase.ts`, which checks `collaboration.status`. When a collaboration is `completed`, the phase resolves to `completed` regardless of the raw `campaigns.status` column.

The Dashboard hook (`src/hooks/useBusinessActiveCampaigns.ts`) has two bugs:
- **Line 26:** Queries only `campaigns.status IN ('draft', 'published', 'active')` — completed campaigns are excluded from the feed entirely, or if included, their raw DB status is displayed.
- **Line 45:** The collaboration query filters `status='active'` only. For a completed campaign, the collaboration status is `completed`, so the lookup misses it. The fallback to `campaign_applications` (line 65) picks up a different accepted applicant ("Roger" instead of "Ricky Ricardo").

The Brand hook (`src/hooks/useBrandActiveCampaigns.ts`) has the same status filter issue on line 27.

### Fix

**`src/lib/campaignPhase.ts`** — Add a helper to map `CampaignPhase` to display-friendly labels that match `ActivityFeedCard`'s `statusStyles` keys:

```typescript
export function phaseToDisplayLabel(phase: CampaignPhase): string {
  switch (phase) {
    case 'pre_hire': return 'published';
    case 'active_delivery': return 'active';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
  }
}
```

**`src/hooks/useBusinessActiveCampaigns.ts`:**
1. Import `deriveCampaignPhase` and `phaseToDisplayLabel`.
2. Add `displayStatus: string` to the `ActiveCampaignItem` interface.
3. Remove `.in('status', ['draft', 'published', 'active'])` — replace with `.not('status', 'eq', 'cancelled')`.
4. Change collaboration query from `.eq('status', 'active')` to `.in('status', ['active', 'completed'])`. Also select `status` from collaborations.
5. Build a `collabStatusMap` alongside the existing `creatorMap`.
6. In the return mapping, compute `displayStatus` via `phaseToDisplayLabel(deriveCampaignPhase(c.status, collabStatusMap.get(c.id)))`.

**`src/hooks/useBrandActiveCampaigns.ts`:**
1. Import `deriveCampaignPhase` and `phaseToDisplayLabel`.
2. Add `displayStatus: string` to `BrandCampaignItem`.
3. Replace `.in('status', ['published', 'active'])` with `.not('status', 'eq', 'cancelled')`.
4. Fetch collaborations for own campaigns (same pattern as business hook).
5. Compute `displayStatus` for own campaigns. For sponsored campaigns, use the sponsorship status directly.

**`src/pages/BusinessDashboard.tsx`:**
- Line 179: Pass `campaign.displayStatus` instead of `campaign.status` to `ActivityFeedCard`.
- Line 139: Change section heading from "Your Active Campaigns" to "Your Campaigns".

**`src/pages/BrandDashboard.tsx`:**
- Line 175: Pass `campaign.displayStatus` instead of `campaign.status` to `ActivityFeedCard`.
- Line 143: Change heading from "Active Campaigns" to "Your Campaigns".

### Files Modified
- `src/lib/campaignPhase.ts`
- `src/hooks/useBusinessActiveCampaigns.ts`
- `src/hooks/useBrandActiveCampaigns.ts`
- `src/pages/BusinessDashboard.tsx`
- `src/pages/BrandDashboard.tsx`

---

## Issue 2: Cross-Post Payload Mismatch

### Root Cause

Two code paths send incorrectly structured payloads to the Outstand API:

**Path A — `src/hooks/outstand/useCrossPost.ts`:** Sends `{ text, socialAccountIds, mediaUrls }`. The Outstand API expects `{ accounts, containers: [{ content, media? }] }`. The working `CustomComposeForm.tsx` (lines 146–175) demonstrates the correct structure.

**Path B — `src/contexts/DonnyProvider.tsx` `publishDraft` (line 155):** Calls `supabase.functions.invoke('outstand-proxy', { body: { path, method, payload } })` with a wrapper object. The proxy routes by URL path (line 86–98 of `outstand-proxy/index.ts`), not by a JSON body with `path`/`method` fields. Additionally, the payload uses wrong field names (`caption`, `media_urls`, `platform`, `content_type`) and is missing the `accounts` array entirely.

### Fix

**`src/hooks/outstand/useCrossPost.ts`** — Restructure the mutation payload:

```typescript
mutationFn: async ({ caption, mediaUrls, accountIds, scheduledAt }: CrossPostInput) => {
  const container: Record<string, unknown> = { content: caption };
  if (mediaUrls.length > 0) {
    container.media = mediaUrls.map((url, i) => ({
      id: `media-${i}`,
      url,
      filename: url.split('/').pop() || `upload-${i}`,
    }));
  }
  const body: Record<string, unknown> = {
    accounts: accountIds,
    containers: [container],
  };
  if (scheduledAt) {
    body.scheduledAt = scheduledAt;
  }
  const res = await api.post('/posts', body);
  if (!res.success) throw new Error(res.error || 'Failed to create cross-post');
  return res.data;
},
```

**`src/contexts/DonnyProvider.tsx` `publishDraft`** — Replace the broken `supabase.functions.invoke` call with a direct `fetch` to the proxy's `/posts` endpoint:

1. Get the user's Supabase access token from the session.
2. Query `business_outstand_accounts` for the user's connected account IDs.
3. Build the correct `{ accounts, containers }` payload.
4. Call `fetch(${SUPABASE_URL}/functions/v1/outstand-proxy/posts, ...)` with the access token as Bearer auth.

The `donny_scheduled_posts` table does not store target account IDs, so `publishDraft` defaults to posting to ALL connected accounts (same behavior as `CrossPostPrompt` which selects all accounts by default on open).

### Files Modified
- `src/hooks/outstand/useCrossPost.ts`
- `src/contexts/DonnyProvider.tsx`

---

## Issue 3: Clickable Dashboard Stats

### Root Cause

`DashboardStatsGrid` renders each stat card as a plain `<div>` with no `onClick` or navigation. The `StatItem` interface has no `href` field.

### Fix

**`src/components/dashboard/DashboardStatsGrid.tsx`:**
1. Add `href?: string` to the `StatItem` interface.
2. Import `Link` from `react-router-dom`.
3. When `stat.href` is present, render a `<Link>` instead of a `<div>`, with hover styles (`cursor-pointer`, `hover:shadow-md`, `transition-shadow`).

**Dashboard pages** — add `href` to each stat definition:

| Dashboard | Stat | Routes To |
|-----------|------|-----------|
| Business | Active | `/dashboard/business/campaigns` |
| Business | Creators | `/dashboard/business/creators` |
| Business | Spend | `/dashboard/payments` |
| Business | ROI | `/dashboard/analytics` |
| Brand | Active Campaigns | `/dashboard/brand/discover-campaigns` |
| Brand | Total Spend | `/dashboard/payments` |
| Brand | Creators | `/dashboard/brand/creators` |
| Brand | Avg. ROI | `/dashboard/analytics` |
| Creator | Revenue | `/dashboard/creator/earnings` |
| Creator | Applied | `/dashboard/creator/campaigns` |
| Creator | Completed | `/dashboard/creator/my-campaigns` |
| Creator | Rating | `/dashboard/creator/settings` |

All routes verified to exist in `src/App.tsx`.

### Files Modified
- `src/components/dashboard/DashboardStatsGrid.tsx`
- `src/pages/BusinessDashboard.tsx`
- `src/pages/BrandDashboard.tsx`
- `src/pages/CreatorDashboard.tsx`

---

## Implementation Order

1. **Issue 1** (campaign status) — self-contained, touches hooks + dashboards
2. **Issue 2** (cross-post) — independent, touches Outstand integration layer
3. **Issue 3** (clickable stats) — independent, touches shared component + dashboards

Each phase ends with `npm run build` + `npm run typecheck`. After all three, verify in browser with all three role accounts.

## Verification

1. Log in as Restaurant (`dwilliams@harbormill.net`) → Dashboard shows "Opening Night Takeover" as "Completed" with correct creator name (Ricky Ricardo, not Roger).
2. Navigate to a deliverable → Cross-Post to Your Socials → "Post Now" succeeds without error.
3. All dashboard stat cards are clickable and route to the correct pages for all three roles.
4. Chrome dev tools shows no console errors on any dashboard.
