# DragonShare Desktop Polish & Restaurant Search

> Design spec for redesigning the creator DragonShare page on desktop and adding typeahead restaurant search with a full browse experience.

## Problem Statement

The creator DragonShare page (`/dashboard/creator/dragonshare`) has two UX problems on desktop:

1. **Stretched layout** — The submit form opens as a full-width bottom sheet that spans the entire viewport on desktop, looking lazy and unpolished. The page itself is constrained to `max-w-3xl` but the sheet ignores this.
2. **Broken restaurant search** — The "Tag Restaurant" search field queries the `organizations` table but provides no typeahead/autocomplete as the creator types. Results render as buttons below the field with no live filtering, no location context, and no visual browsing fallback.

## Scope

- Redesign the creator DragonShare page layout for desktop (inline side-by-side form)
- Keep mobile behavior (bottom sheet) unchanged except for adding typeahead to the restaurant search
- Add typeahead autocomplete dropdown to the restaurant search field (both desktop and mobile)
- Build a full-page restaurant browse experience at a new route
- Add cuisine and location filter support to the browse page

### Out of Scope

- Business/restaurant DragonShare page changes
- Boost flow or payment changes
- New database columns or migrations (use existing `brand_category`, `industry`, `city`, `postal_code` fields)
- Advanced filters (boost history, distance-based) — deferred until there's enough data

## Design

### 1. Desktop Page Layout — Side-by-Side

Replace the current single-column layout + bottom sheet with an inline two-column layout on desktop (`lg:` breakpoint and above).

**Structure:**

```
┌─────────────────────────────────────────────────────────┐
│ DragonShare (gradient banner — title + subtitle)        │
├───────────────────────┬─────────────────────────────────┤
│ Share Your Content    │ [Submitted(3)] [Boosted(1)] ... │
│ (form card, sticky)   │                                 │
│ ┌───────────────────┐ │ ┌──────────┐ ┌──────────┐      │
│ │ Upload zone       │ │ │ Post     │ │ Post     │      │
│ │                   │ │ │ card 1   │ │ card 2   │      │
│ └───────────────────┘ │ └──────────┘ └──────────┘      │
│ Post Link (optional)  │ ┌──────────┐                   │
│ Tag Restaurant 🔍     │ │ Post     │                   │
│ [Submit]              │ │ card 3   │                   │
│ Quick tip             │ └──────────┘                   │
└───────────────────────┴─────────────────────────────────┘
```

**Specifications:**

- **Left column**: Fixed width `w-[440px]`, contains the submit form in a white card with teal border (`border-2 border-dc-teal/30 rounded-2xl`). The card is `sticky top-6` so it scrolls with the page.
- **Right column**: `flex-1 min-w-0`, contains the tab pills and post card grid (2 columns via `grid-cols-2`).
- **Page header**: Gradient banner (`bg-gradient-to-br from-dc-teal/10 to-pink-50`) with "DragonShare" title and subtitle. The "+ Share Content" button is removed since the form is always visible.
- **Quick tip**: Moves inside the submit form card below the Submit button, keeping it contextually associated with the submit flow.
- **HowItWorks component**: Moves to the right column above the post grid (or shows as empty state when no posts exist).
- **Container**: Remove `max-w-3xl mx-auto` constraint on desktop — the side-by-side layout naturally fills the space.

**Mobile behavior (unchanged except search):**

- The page keeps its current single-column layout with the "+ Share Content" button.
- Clicking the button opens the existing `DragonShareSubmitSheet` bottom sheet.
- The only mobile change is adding typeahead to the restaurant search field inside the sheet.

### 2. Restaurant Search — Typeahead Dropdown

Replace the current `OrgPickerButton` grid with a typeahead autocomplete dropdown that appears as the creator types.

**Behavior:**

1. Creator focuses the "Tag Restaurant" input field.
2. On idle (no text typed), show nothing or a "Start typing to search..." hint.
3. As the creator types, fire a debounced (300ms) query to `organizations` joined with `org_units` (filtered to `is_primary = true`) for location and category data.
4. A dropdown appears below the input showing up to 8 matching results. While the query is in flight, show a loading spinner or skeleton rows in the dropdown.
5. Each result row shows: restaurant logo (or initial fallback), name, location (from `org_units.address`), and a cuisine/category badge (from `org_units.brand_category`).
6. Clicking a result selects it, closes the dropdown, and shows the selected restaurant as a chip in the input area.
7. The chip has an `×` button to clear the selection and re-enable search.
8. At the bottom of the dropdown, a persistent "Browse all restaurants →" link navigates to the browse page.
9. If no results match, show "No restaurants found" with the browse link still visible.

**Query approach:**

```sql
SELECT o.id, o.name, o.logo_url, o.org_type,
       ou.address, ou.brand_category, ou.lat, ou.lng
FROM organizations o
LEFT JOIN org_units ou ON ou.org_id = o.id AND ou.is_primary = true
WHERE o.deleted_at IS NULL
  AND (o.name ILIKE '%search_term%' OR ou.address ILIKE '%search_term%')
LIMIT 8
```

The query joins `org_units` (the location table) directly via `org_id`. Uses `LEFT JOIN` so orgs without units still appear. Searches both restaurant name and address, so typing "Hoboken" surfaces all Hoboken restaurants. Parentheses around the `OR` prevent returning soft-deleted orgs that match only by address.

**Selected state UI:**

```
┌──────────────────────────────────┐
│ [logo] Benny's Bistro  ×        │
└──────────────────────────────────┘
```

### 3. Browse Restaurants Page

New route: `/dashboard/creator/dragonshare/browse`

Wrapped in `DashboardLayout` with `userRole="content_creator"`. Follows the same visual pattern as the existing Browse Creators page (`CreatorBrowse.tsx` + `CreatorBrowseHeader.tsx`).

**Page structure:**

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to DragonShare                                   │
│ Find Restaurants                                        │
│ Browse restaurants near you to tag in your content       │
├─────────────────────────────────────────────────────────┤
│ 🔍 Search by name or location...                        │
├─────────────────────────────────────────────────────────┤
│ [All] [Italian] [Mexican] [Asian] ...   24 results  ⚙  │
├─────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ Rest.    │ │ Rest.    │ │ Rest.    │                 │
│ │ card 1   │ │ card 2   │ │ card 3   │                 │
│ └──────────┘ └──────────┘ └──────────┘                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ Rest.    │ │ Rest.    │ │ Rest.    │                 │
│ └──────────┘ └──────────┘ └──────────┘                 │
└─────────────────────────────────────────────────────────┘
```

**Components:**

- **Back link**: Teal text with left arrow, navigates to `/dashboard/creator/dragonshare`.
- **Search bar**: Full-width rounded pill input. Filters by restaurant name or address (via `org_units`). Debounced 300ms.
- **Cuisine filter pills**: Horizontal scrollable row of pill buttons. "All" is active by default (dc-teal-btn fill). Other pills show dynamically populated `brand_category` values from the data. Active pill gets `bg-dc-teal-btn text-white`, inactive gets `bg-dc-teal/10 text-dc-text-muted`.
- **Result count**: Shows total matching restaurants.
- **Filters button**: Opens a side sheet (right-aligned) with Location filter — city input and postal code input, matching the `AdvancedCreatorFilters` pattern.

**Restaurant card design:**

```
┌──────────────────────────┐
│  [gradient bg]           │
│     [Logo / Initial]     │
│              [Cuisine] ← │  badge, top-right
├──────────────────────────┤
│  Restaurant Name         │
│  📍 Location             │
│               Select →   │
└──────────────────────────┘
```

- **Header area**: Gradient background (color derived from first letter or logo), restaurant logo centered (56px rounded square), cuisine badge top-right (from `org_units.brand_category`).
- **Body**: Restaurant name (bold), location with pin icon (from `org_units.address`, parsed to city/state), and "Select →" link. Star ratings omitted for now — `average_rating` lives on `business_profiles` and requires a multi-hop join; can be added later when review data is meaningful.
- **Grid**: `grid-cols-3` on desktop (`lg:`), `grid-cols-2` on tablet (`md:`), `grid-cols-1` on mobile.
- **Interaction**: Clicking the card or "Select" navigates back to `/dashboard/creator/dragonshare?restaurant={orgId}`, where the page reads the query param and pre-fills the form with the selected restaurant.

**Empty state**: "No restaurants found matching your search. Try adjusting your filters." with a reset button.

### 4. Data Flow — Restaurant Selection from Browse

When a creator selects a restaurant from the browse page:

1. Navigate to `/dashboard/creator/dragonshare?restaurant={orgId}`
2. The DragonShare page reads the `restaurant` query param on mount.
3. If present, fetch the org data and pre-fill the "Tag Restaurant" field with the selected restaurant chip.
4. Clear the query param from the URL (via `history.replaceState`) to prevent stale state on refresh.

On mobile, the same flow works: the browse page navigates back, the DragonShare page opens the submit sheet with the restaurant pre-filled.

### 5. Component Architecture

**New files:**

| File | Purpose |
|------|---------|
| `src/components/dragonshare/DragonShareInlineForm.tsx` | Desktop inline submit form (extracted from sheet logic) |
| `src/components/dragonshare/RestaurantTypeahead.tsx` | Typeahead search input + dropdown component |
| `src/components/dragonshare/RestaurantCard.tsx` | Restaurant card for browse grid |
| `src/components/dragonshare/RestaurantBrowseHeader.tsx` | Search bar + cuisine pills + filter controls |
| `src/components/dragonshare/RestaurantBrowseFilters.tsx` | Side sheet with location filters |
| `src/pages/DragonShareBrowseRestaurants.tsx` | Browse restaurants page |
| `src/hooks/useRestaurantSearch.ts` | Debounced search hook querying orgs + org_units |
| `src/hooks/useRestaurantBrowse.ts` | Browse page state: filters, sorting, pagination |
| `src/hooks/useDragonShareSubmitForm.ts` | Shared form logic (upload, URL parsing, restaurant selection, submission) for desktop inline form and mobile sheet |

**Modified files:**

| File | Change |
|------|--------|
| `src/pages/CreatorDragonShare.tsx` | Side-by-side layout on desktop, read `restaurant` query param, conditionally render inline form vs sheet trigger |
| `src/components/dragonshare/DragonShareSubmitSheet.tsx` | Replace `OrgPickerButton` grid with `RestaurantTypeahead` component |
| `src/App.tsx` (or routes config) | Add route for `/dashboard/creator/dragonshare/browse` |

**Shared logic:**

The submit form logic (file upload, URL parsing, restaurant selection, submission mutation) is currently in `DragonShareSubmitSheet.tsx`. Extract the core form logic into a shared hook (`useDragonShareSubmitForm`) so both the desktop inline form and the mobile bottom sheet can reuse it without duplication.

### 6. Responsive Breakpoints

| Viewport | Layout |
|----------|--------|
| Mobile (< `lg`) | Current layout: single column, "+ Share Content" button opens bottom sheet. Sheet gets typeahead search. This includes tablet viewports — the bottom sheet pattern works well up to `lg`. |
| Desktop (`lg`+) | Side-by-side: form left (440px), history right (flex-1). Inline form, no sheet. |

### 7. Empty States

**No posts yet (right column on desktop):**
Show `DragonShareHowItWorks` component explaining the flow, followed by `DragonShareQuickTip`. This educates new creators while the form is ready to use on the left.

**No restaurants match search (typeahead):**
"No restaurants found" message with "Browse all restaurants →" link still visible.

**No restaurants on browse page:**
"No restaurants found matching your search. Try adjusting your filters." with a "Reset filters" button.

## Files Affected

### New (9 files)
- `src/components/dragonshare/DragonShareInlineForm.tsx`
- `src/components/dragonshare/RestaurantTypeahead.tsx`
- `src/components/dragonshare/RestaurantCard.tsx`
- `src/components/dragonshare/RestaurantBrowseHeader.tsx`
- `src/components/dragonshare/RestaurantBrowseFilters.tsx`
- `src/pages/DragonShareBrowseRestaurants.tsx`
- `src/hooks/useRestaurantSearch.ts`
- `src/hooks/useRestaurantBrowse.ts`
- `src/hooks/useDragonShareSubmitForm.ts`

### Modified (3 files)
- `src/pages/CreatorDragonShare.tsx`
- `src/components/dragonshare/DragonShareSubmitSheet.tsx`
- Routes configuration (App.tsx or equivalent)

### No database migrations required
All data fields already exist: `organizations.name`, `organizations.logo_url`, `org_units.org_id`, `org_units.address`, `org_units.brand_category`, `org_units.lat`, `org_units.lng`, `org_units.is_primary`.
