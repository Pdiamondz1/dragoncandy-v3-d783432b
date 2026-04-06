# Creator Campaign Gaps — Design Spec

## Overview

Fill the remaining gaps in the creator-facing campaign experience. The swipe card, detail modal, application form, and search/filter system are already built. This spec covers 5 targeted enhancements to complete the creator campaign flow for launch.

## Scope

**In scope:**
1. Portfolio attachment on application form
2. Active campaigns tab
3. Completed campaigns tab
4. Raw footage download after acceptance
5. Business profile link in detail modal

**Out of scope:**
- Distance display (requires geocoding infrastructure — separate project)
- Posted time on swipe card (already implemented)
- Any changes to restaurant/business-side pages or dashboard
- Desktop `lg:` Tailwind classes must be preserved

---

## Gap 1: Portfolio Attachment on Application Form

### Problem
Creators cannot attach a sample of their work when applying. Businesses have no way to quickly assess a creator's relevant experience for the specific campaign.

### Solution
Add a portfolio sample section to `CampaignApplyForm.tsx`.

### Database Change
Add one nullable column to `campaign_applications`:

```sql
ALTER TABLE campaign_applications
ADD COLUMN portfolio_url text;
```

### UI Design
Below the "Quick Pitch" textarea, add a new section:

```
📎 Attach a Sample (optional)

[Thumbnail grid of creator's portfolio images — tap to select]
  [ img1 ] [ img2 ] [ img3 ]

— or —

[ Paste a link to your best work ]
```

**Behavior:**
- Query `creator_profiles.portfolio_urls` for the current user
- `portfolio_urls` are Supabase Storage paths (not displayable URLs). Convert them to public URLs using `supabase.storage.from('profile-assets').getPublicUrl(path)` — same pattern used in `PublicCreatorProfile.tsx:160-175` (handles both storage paths and `http://` URLs)
- If the creator has portfolio items, render them as a horizontal scroll of small thumbnail images (w-16 h-16 rounded-xl). Tap to select (teal ring when active), tap again to deselect
- Below thumbnails, show a text input for pasting a custom URL as an alternative
- Selecting a thumbnail sets the portfolio URL to the public URL of that storage item; typing in the input deselects any thumbnail
- The selected/entered URL is saved as `portfolio_url` on the application
- Pass `portfolioUrl` through to `useCreateApplication` mutation — add `portfolioUrl?: string` to the mutation input type AND to the Supabase `.insert()` call as `portfolio_url`

### Files to Modify
- `src/components/campaigns/CampaignApplyForm.tsx` — add portfolio section UI + state
- `src/hooks/useCreateApplication.ts` — add `portfolioUrl` to mutation input
- `src/integrations/supabase/types.ts` — will auto-update after DB migration

### Files to Create
- `supabase/migrations/XXXXXX_add_portfolio_url_to_applications.sql`

---

## Gap 2: Active Campaigns Tab

### Problem
The "Active" tab in `CreatorCampaignMarketplace.tsx` is disabled. After a creator's application is accepted and a collaboration is created, they have no way to view their active campaigns, see deadlines, or upload content.

### Data Source
`campaign_collaborations` table — columns: `id`, `campaign_id`, `creator_id`, `status` (enum: `active | completed | cancelled`), `content_deadline`, `content_status`, `deliverables_status` (JSON), `revision_count`, `created_at`.

### New Hook: `useCreatorCollaborations`

**File:** `src/hooks/useCreatorCollaborations.ts`

```typescript
interface CreatorCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  content_deadline: string | null;
  content_status: string | null;
  deliverables_status: Record<string, string> | null;
  revision_count: number | null;
  completed_at: string | null;
  created_at: string;
  campaign: {
    id: string;
    title: string;
    budget_min: number | null;
    budget_max: number | null;
    fixed_price: number | null;
    pricing_type: string | null;
    delivery_type: string | null;
  };
  business_profile: {
    business_name: string;
    logo_url: string | null;
    profile_slug: string | null;
  };
}
```

**Query:** Select from `campaign_collaborations` where `creator_id = auth.uid()`, join `campaigns` and `business_profiles` (via `campaigns.user_id`). Filter by status param.

### New Component: `ActiveCampaignCard`

**File:** `src/components/campaigns/ActiveCampaignCard.tsx`

**Layout (mobile card):**
```
┌─────────────────────────────────────────┐
│ [Logo] Campaign Title                   │
│        Business Name ✓                  │
│                                         │
│  ⏱ Due in 2h 15m          [In Progress] │
│  ──────────────●──────── 60%            │
│                                         │
│  📦 2/3 deliverables submitted          │
│                                         │
│  [ Upload Content ]  (teal, full-width) │
└─────────────────────────────────────────┘
```

**Elements:**
- Business logo (rounded-full, ring-2 ring-dc-teal) + campaign title (bold) + business name
- Deadline countdown: calculate from `content_deadline` relative to now
  - DragonDash: show hours/minutes remaining, orange text if < 1h
  - Express: show hours remaining
  - Standard: show days remaining
  - If overdue: "Overdue by X" in red
- Progress bar: derive from `deliverables_status` JSON. Expected shape: `Record<string, 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved'>` keyed by deliverable ID. Count entries with status `submitted` or `approved` as "done" vs total entries. If `deliverables_status` is null, fall back to a simple status display without a progress bar
- Status badge (top-right corner):
  - "In Progress" — gray bg
  - "Revision Requested" — orange bg, draws attention
  - "Submitted" — teal bg
- "Upload Content" button: navigates to the campaign detail/upload flow (use existing file upload infrastructure)
- Deliverables summary: "2/3 deliverables submitted"

**Revision requested treatment:**
If `content_status === 'revision_requested'`, show an alert banner:
```
⚠️ Revision requested · Check deliverable feedback
```

### Empty State
When no active collaborations exist:
```
"No active campaigns yet."
"When a business accepts your application, your campaign will appear here."
[ Browse Campaigns ] (teal outline button, switches to Available tab)
```

### Tab Integration
In `CreatorCampaignMarketplace.tsx`:
- Remove `disabled: true` from the Active tab
- Add `useCreatorCollaborations('active')` query
- Render `ActiveCampaignCard` list in the active tab content area
- Show count badge on tab if active collaborations exist

---

## Gap 3: Completed Campaigns Tab

### Problem
The "Done" tab is disabled. Creators can't see their completed work history or leave reviews.

### New Component: `CompletedCampaignCard`

**File:** `src/components/campaigns/CompletedCampaignCard.tsx`

**Layout:**
```
┌─────────────────────────────────────────┐
│ [Logo] Campaign Title                   │
│        Business Name ✓                  │
│                                         │
│  ✅ Completed · Mar 28, 2026            │
│  💰 $350 earned                         │
│                                         │
│  ★★★★★  or  [ Leave a Review ]          │
└─────────────────────────────────────────┘
```

**Elements:**
- Business logo + campaign title + business name (same pattern as ActiveCampaignCard)
- Completion date from `completed_at`
- Budget display: use `formatBudget(campaign)` to show the campaign budget. Note: for bid-range campaigns this shows the range, not the creator's actual agreed rate. Showing the exact payout would require joining `campaign_applications.proposed_rate` — defer that to a future "earnings dashboard" feature. For now, the campaign budget is sufficient context
- Review state:
  - If a `project_reviews` row exists for this collaboration: show star rating
  - If not: show "Leave a Review" button (teal outline)
  - "Leave a Review" opens a simple bottom sheet or inline form with star rating + text
- "View Details" link to see final deliverables

### Review Submission
**Hook:** `useCreateReview` — insert into `project_reviews` table with:
- `collaboration_id` — from the collaboration
- `rating` — 1-5 star rating from the creator
- `review_text` — optional text comment
- `reviewer_id` — `auth.uid()`
- `reviewee_id` — the business user ID (derivable from `collaboration.campaign.user_id` via the joined campaign data)
- `review_type` — `'creator_to_business'` (required, not nullable)
- `is_public` — default `true`

**Query for existing review:** Check `project_reviews` where `collaboration_id` matches and `reviewer_id = auth.uid()` — include in `useCreatorCollaborations` response or as a separate lightweight query.

### Empty State
When no completed collaborations exist:
```
"No completed campaigns yet."
"Your finished campaigns and earnings will show up here."
```

### Tab Integration
In `CreatorCampaignMarketplace.tsx`:
- Remove `disabled: true` from the Done tab
- Add `useCreatorCollaborations('completed')` query
- Render `CompletedCampaignCard` list

---

## Gap 4: Raw Footage Download After Acceptance

### Problem
The detail modal shows a "Raw Footage Provided — Available after acceptance" badge, but never actually shows the footage even after the creator is accepted.

### Solution
In `CampaignDetailModal.tsx`, conditionally render footage thumbnails based on application status.

### Logic
The modal already receives `campaign` which is a `PublicCampaign` — this type includes `application_status`. The `useCampaignDetail` hook already fetches all `campaign_media` including `raw_footage` items.

**Change in `CampaignDetailModal.tsx`:**

Replace the current raw footage section (the `{hasRawFootage && (...)}` block) with:

```
If hasRawFootage:
  If campaign.application_status === 'accepted':
    Show heading: "📹 Raw Footage"
    Show horizontal scroll of footage thumbnails (same pattern as visual references)
    Each thumbnail:
      - Click to open full-size in a new tab (or lightbox if one exists)
      - Download icon overlay on each thumbnail
      - File name + size below thumbnail
  Else:
    Show current "Available after acceptance" badge (unchanged)
```

**Data:** `detail.media` already contains items with `media_type === 'raw_footage'`. Filter these out and render them. Each has `file_url`, `thumbnail_url`, `file_name`, `file_size_bytes`.

**File URL handling:** The existing reference media rendering (`CampaignDetailModal.tsx`) already uses `item.file_url` directly in `<img src>` tags — follow the same pattern. These are public Supabase Storage URLs. For downloads, use an `<a href={item.file_url} download={item.file_name} target="_blank">` anchor tag.

### Files to Modify
- `src/components/campaigns/CampaignDetailModal.tsx` — conditional footage rendering

---

## Gap 5: Business Profile Link

### Problem
The detail modal shows business info but doesn't link to the business's public profile page.

### Solution
Add a "View Business Profile" link in the "About the Business" section of `CampaignDetailModal.tsx`.

### Implementation
The route `/business/:slug` already exists (renders `PublicBusinessProfile`). Business profiles have a `profile_slug` field.

**Change in `CampaignDetailModal.tsx`:**
In the "About the Business" section, after the business name/location div, add:

```tsx
<Link
  to={`/business/${businessSlug}`}
  className="text-xs text-dc-teal font-semibold hover:underline mt-2 inline-block"
>
  View Business Profile →
</Link>
```

**Data requirement:** `PublicCampaign.business_profile` needs to include `profile_slug`. This means updating `usePublicCampaigns.ts` to select `profile_slug` from `business_profiles` in its join query.

### Files to Modify
- `src/components/campaigns/CampaignDetailModal.tsx` — add link
- `src/hooks/usePublicCampaigns.ts` — add `profile_slug` to the business_profiles select query and to the `PublicCampaign.business_profile` type

---

## File Change Summary

| File | Action | Gap |
|------|--------|-----|
| `src/components/campaigns/CampaignApplyForm.tsx` | Edit | 1 |
| `src/hooks/useCreateApplication.ts` | Edit | 1 |
| `supabase/migrations/XXXXXX_add_portfolio_url.sql` | Create | 1 |
| `src/hooks/useCreatorCollaborations.ts` | Create | 2, 3 |
| `src/components/campaigns/ActiveCampaignCard.tsx` | Create | 2 |
| `src/components/campaigns/CompletedCampaignCard.tsx` | Create | 3 |
| `src/hooks/useCreateReview.ts` | Create | 3 |
| `src/pages/CreatorCampaignMarketplace.tsx` | Edit | 2, 3 |
| `src/components/campaigns/CampaignDetailModal.tsx` | Edit | 4, 5 |
| `src/hooks/usePublicCampaigns.ts` | Edit | 5 |

**New files:** 5
**Modified files:** 5
**DB migrations:** 1 (add `portfolio_url` column)

---

## Pre-existing Bug (fix during implementation)

`CreatorCampaignMarketplace.tsx:59` has a self-referencing assignment: `const availableFilteredCount = availableFilteredCount;` — this will cause a runtime error. Fix to: `const availableFilteredCount = filteredBySearch.filter(c => !c.user_applied && !skippedIds.has(c.id)).length;` or derive from `swipeCampaigns.length`.

## Verification

- `npm run build` must succeed
- Cards render correctly on mobile (375-430px)
- Desktop `lg:` Tailwind classes preserved (no modifications to existing desktop layouts)
- No changes to restaurant/business-side pages
- All Supabase queries use `.select()` field lists (no `select *`)
- Error and loading states handled for all new queries
