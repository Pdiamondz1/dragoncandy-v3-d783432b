# Brand Browse & Sponsor — Design Spec

**Date:** 2026-04-06
**Feature slug:** brand-browse-sponsor

## Summary

Transform the existing `BrandCreators` page (`/dashboard/brand/creators`) from a basic creator browse into a **filterable creator grid with shortlist and bulk campaign invite** — the core discovery surface for Brand sponsors.

## Problem

Brands need to discover creators in bulk by persona/audience/region, shortlist them, and send sponsorship invitations attached to existing campaigns. The current page is a thin wrapper around the Business browse with no shortlisting, no campaign context, and no invite workflow.

## Design

### UX Model

A **filterable grid** (not a swipe stack). Brands are data-driven — they need to scan many creators at once, compare stats, and batch-select.

### Page Layout

```
┌─────────────────────────────────────────────┐
│  BROWSE & SPONSOR           [Campaign ▾]    │  ← sticky header
│  Search ───────────────────────────────────  │
│  [All] [Video] [Photo] [UGC] ...            │  ← content type pills
│  123 creators  Sort ▾  Filters  Map         │
├─────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐                   │
│  │ Creator │  │ Creator │                   │  ← 2-col mobile, 3-4 desktop
│  │  Card   │  │  Card   │                   │
│  │ [Save]  │  │ [Save]  │                   │
│  │ [Invite]│  │ [Invite]│                   │
│  └─────────┘  └─────────┘                   │
│  ...                                         │
├─────────────────────────────────────────────┤
│  ┌── Shortlist Drawer ──────────────────┐   │  ← slides up from bottom (mobile)
│  │ 5 creators saved  [Invite All ▸]     │   │     or side panel (desktop)
│  │ [avatar] [avatar] [avatar] ...       │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Components

| Component | Location | Purpose |
|---|---|---|
| `BrandCreators` (page) | `src/pages/BrandCreators.tsx` | Orchestrates everything |
| `BrandCreatorCard` | `src/components/brand-browse/BrandCreatorCard.tsx` | Card with save/invite actions |
| `ShortlistDrawer` | `src/components/brand-browse/ShortlistDrawer.tsx` | Saved creators + bulk invite |
| `CampaignContextSelector` | `src/components/brand-browse/CampaignContextSelector.tsx` | Pick campaign for match scores |
| `EmptyStateNoCampaigns` | `src/components/brand-browse/EmptyStateNoCampaigns.tsx` | CTA to create first campaign |

### Reused Components

- `CreatorBrowseHeader` — search bar, content type pills, sort, filter/map buttons
- `CreatorBrowseContent` — grid layout, loading skeletons, filter sheet, map dialog
- `AdvancedCreatorFilters` — all existing filter controls
- `CreatorProfileModal` — opens on card click
- `CreatorMapView` — optional map toggle

### Data

**Existing tables used:**
- `creator_profiles` — source of all creator data
- `campaign_invitations` — write invitations here
- `campaigns` — list brand's active campaigns for context selector

**New table:**
```sql
CREATE TABLE brand_shortlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, creator_id)
);

ALTER TABLE brand_shortlists ENABLE ROW LEVEL SECURITY;

-- Brand can only see/manage their own shortlist
CREATE POLICY "brand_shortlists_select" ON brand_shortlists
  FOR SELECT USING (brand_id = auth.uid());
CREATE POLICY "brand_shortlists_insert" ON brand_shortlists
  FOR INSERT WITH CHECK (brand_id = auth.uid());
CREATE POLICY "brand_shortlists_delete" ON brand_shortlists
  FOR DELETE USING (brand_id = auth.uid());
```

### Hooks

| Hook | Purpose |
|---|---|
| `useBrandShortlist` | Fetch/add/remove shortlisted creators for current brand |
| `useBulkInvite` | Send campaign_invitations for multiple creators at once |

### Card Design

Each `BrandCreatorCard` shows:
- Avatar (circular, teal ring)
- Creator name + rating
- Location
- Persona/skill tags (first 2 + overflow)
- Platform icons (Instagram, TikTok, etc.)
- Rate + reviews
- Match score badge (if campaign selected)
- **Two action buttons:** "Save" (bookmark icon) and "Invite" (send icon)

### Shortlist Drawer

- **Mobile:** Bottom sheet, peek height shows count + avatars
- **Desktop:** Side panel (right)
- Shows saved creator avatars + names
- "Remove" action per creator
- Campaign selector (if not already chosen)
- "Invite All to Campaign" primary CTA
- Success state after bulk invite

### Empty State

When brand has no published/active campaigns:
- Illustration + message: "Create a campaign first to start discovering creators"
- CTA button → `/dashboard/brand/campaigns/create`

### Navigation Update

Add "Creators" to brand bottom nav between Campaigns and Create:
```
Home | Campaigns | Creators (center) | Messages | Profile
```
Replace the center "Create" button with "Creators" using the Users icon, and make it the center prominent button.

## Out of Scope

- Donny AI match scoring (future iteration — requires edge function)
- Engagement rate / follower-tier filters (creator_profiles doesn't have this data yet)
- Language filter (not in schema)
- Performance score (not in schema)

These filters are noted as future enhancements once the creator_profiles schema is extended.

## Testing

- `npm run build` passes
- Brand can filter creators, save to shortlist, bulk-invite to campaign
- RLS: brand cannot see another brand's shortlist
- Invitations appear in `campaign_invitations` with `status='pending'`
