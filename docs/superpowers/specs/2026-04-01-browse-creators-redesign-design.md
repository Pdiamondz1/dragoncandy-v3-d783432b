# Browse Creators Redesign — Design Spec

**Date:** 2026-04-01
**Approach:** Refine, don't rebuild — keep existing data layer, hooks, and modal system; redesign visual presentation and add missing UX features.

---

## Scope

**In scope:**
- Header redesign (white background, action-oriented title)
- Filter bar with content-type pills, search promotion, sort dropdown
- Hybrid creator cards (thumbnail left, data right)
- Responsive grid layout (1/2/3 columns)
- Map moved to full-screen overlay
- Empty state with clear-filters CTA
- Client-side favorites (localStorage)

**Out of scope (protected):**
- Backend/Supabase query changes
- Creator profile/portfolio page modifications
- New database columns or fields

---

## 1. Header + Filter Bar

### Header
- **Background:** White (`bg-white`), replacing current pink (`bg-dc-pink-bg`)
- **Title:** "Find Creators" — bold, dark text, not ALL CAPS
- **Subtitle:** "Discover local creators matched to your brand" — gray, smaller

### Search Bar
- Promoted to top-level (currently buried in advanced filters)
- Full-width pill shape, gray background, search icon left
- Placeholder: "Search creators by name or skill..."
- Maps to existing `searchTerm` filter in `useCreatorBrowse`

### Content-Type Pills
- Horizontally scrollable row below search bar
- Pills derived from the existing skill categories in `AdvancedCreatorFilters`: Video Editing | Photography | UGC Creation | Social Media | Copywriting | Graphic Design | Animation | Content Strategy
- Show the most popular 6-8 as pills; selecting multiple is allowed (OR logic, matching existing filter behavior)
- Active pill: teal fill (`bg-teal-400 text-white`), inactive: gray (`bg-gray-100 text-gray-600`)
- "All" pill (always first) clears the skill filter
- Maps to existing `skills` filter in `useCreatorBrowse` — same OR-matching logic already implemented

### Sort + Filter Controls Row
- Left: creator count ("24 creators")
- Right: Sort dropdown + Filters button
- **Sort dropdown** (pill-shaped, gray bg):
  - Relevance (default) — current `created_at DESC` order
  - Top Rated — `average_rating DESC`, nulls last
  - Price: Low to High — `base_rate_per_hour ASC`, nulls last
  - Price: High to Low — `base_rate_per_hour DESC`, nulls last
  - Most Reviewed — `total_reviews DESC`, nulls last
  - All sorting is client-side on already-fetched data
- **Filters button** (pill-shaped, gray bg, gear icon): opens existing `AdvancedCreatorFilters` as a slide-up sheet/drawer, preserving all current filter capabilities (location, rate range, platforms, availability, experience)

### Map Access
- "View on Map" button/icon in the filter controls area
- Opens existing `CreatorMapView` as a full-screen overlay with a close/back button
- Replaces current tab-based Grid/Map/Split view system
- `CreatorMapView` component stays intact — only its mounting changes

---

## 2. Creator Card (Hybrid Layout)

### Structure
Horizontal card: thumbnail on left, data on right.

```
┌──────────┬──────────────────────────────┐
│          │ Creator Name        ★ 4.8    │
│ Thumbnail│ 📍 City, Country             │
│ (portfolio│ [Food] [Reels] +1 more      │
│  image)  │ 5 reviews · $45/hr           │
│     ♡    │ [    View Profile    ]        │
└──────────┴──────────────────────────────┘
```

### Data Mapping

| Element | Source | Fallback |
|---------|--------|----------|
| Thumbnail | `portfolio_urls[0]` (signed URL) | `avatar_url` → teal gradient with creator initials |
| Name | `creator_name` | — (required field) |
| Rating | `average_rating` | Hide star entirely if null |
| Location | `city`, `country` | Hide row if both null |
| Tags | `skills[]` | Show first 2 + "+N more" overflow. Hide row if empty |
| Metrics | `total_reviews`, `base_rate_per_hour` | Show whichever is available. Hide row if both null |
| Heart | Client-side localStorage toggle | Default: unfilled outline |
| CTA | "View Profile" button | Opens existing `CreatorProfileModal` |

### Styling
- Card: `bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm`
- Thumbnail: fixed width (~120px on mobile, ~130px on tablet+), full card height, `object-cover`
- Heart icon: top-right corner of thumbnail, white semi-transparent circle background, toggles between outline (gray) and filled (pink `#F9A8D4`)
- Name: `font-bold text-gray-900`
- Rating: `text-yellow-400` star + number
- Location: `text-gray-500 text-sm` with pin emoji
- Tags: `bg-teal-50 text-teal-700 rounded-full text-xs px-2 py-0.5`
- Metrics: `text-gray-400 text-xs`
- CTA button: `w-full bg-teal-400 text-white rounded-full font-semibold text-sm py-2`

### Interaction
- Tap card anywhere (except heart) → opens `CreatorProfileModal`
- Tap heart → toggles favorite in localStorage
- "View Profile" button → same as card tap (redundant affordance)
- Contact button removed from card — lives inside profile modal only

---

## 3. Grid Layout

### Breakpoints
- **Mobile (<640px):** `grid-cols-1`, full-width cards, thumbnail 110px wide
- **Tablet (640px–1023px):** `grid-cols-2`, cards slightly shorter
- **Desktop (1024px+):** `grid-cols-3` (practical max given `DashboardLayout` constraints may be 2)

### Spacing
- Grid gap: `gap-3` (12px)
- Page padding: `px-4` on mobile, `px-6` on larger screens

---

## 4. Empty State

When no creators match the current filters:

- Centered layout with search icon (magnifying glass)
- **Title:** "No creators found" — bold, dark
- **Body:** "Try expanding your search or adjusting filters to see more creators."
- **CTA:** "Clear All Filters" teal pill button — resets all filters to defaults

---

## 5. Favorites (Client-Side)

- Stored in localStorage key: `creator-favorites` as a JSON array of `creator_profile.id` strings
- Toggle on card heart icon
- No backend persistence — purely client-side for now
- No dedicated "favorites" view in this phase (future feature)

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `src/pages/CreatorBrowse.tsx` | Remove pink bg, update layout wrapper |
| `src/components/creator-browse/CreatorBrowseHeader.tsx` | New header with title/subtitle, search bar, pills, sort/filter row |
| `src/components/creator-browse/CreatorBrowseContent.tsx` | Remove tab system (Grid/Map/Split), render grid + map overlay |
| `src/components/creator-browse/CreatorCard.tsx` | Redesign to hybrid layout with new data display |
| `src/hooks/useCreatorBrowse.ts` | Add sort logic, add content-type pill filter |
| `src/components/creator-search/AdvancedCreatorFilters.tsx` | Adapt to render inside a slide-up sheet/drawer |

### Files NOT Modified
- `src/components/creator-browse/CreatorMapView.tsx` — kept as-is, just mounted differently
- `src/components/creator-browse/CreatorProfileModal.tsx` — untouched
- `src/components/creator-browse/CreatorPortfolioModal.tsx` — untouched
- Any Supabase types, queries, or backend code

---

## 7. Verification

- `npm run build` succeeds with no TypeScript errors
- Grid renders correctly at 375px (1 col), 768px (2 col), 1440px (3 col)
- Cards gracefully handle missing data (no rating, no location, no skills, no rate)
- Sort changes card order correctly
- Content-type pills filter by skill
- Search filters by name/skill
- Filters button opens advanced filters
- Map overlay opens and closes cleanly
- Heart toggle persists across page navigation (localStorage)
- Empty state appears when no results match
- "Clear All Filters" resets to default state
