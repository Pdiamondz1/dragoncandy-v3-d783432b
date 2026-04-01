# Creator Profile Polish — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Scope:** `PublicCreatorProfile.tsx` and its direct dependencies only. No changes to browse page, dashboard, or messaging.

---

## Problem

The public creator profile page has several issues:
1. Stats row shows profile metadata (years experience, max projects/mo, portfolio count) — not real achievement data
2. Rating is hardcoded to "4.5 RATING" instead of reading from the database
3. Reviews section renders even when no reviews exist
4. No About section — bio is a bare paragraph with no structure, skills, or rate info
5. Portfolio grid has no content type indicators and skips the first item (used as hero)
6. Single vague "GET IN TOUCH" CTA
7. New creators see all zeros with no friendly fallback

## Solution

Redesign as Approach B (Professional Portfolio): fix all data bugs, add an About card with skills/rate, improve portfolio grid with type badges, conditional reviews, and dual CTAs. Single scrollable page, no tabs.

---

## Section 1: Hero + Profile Card

### Hero
- Keep full-width cover photo (`h-[40vh]`)
- Upgrade bottom overlay from `bg-black/10` to a gradient: `bg-gradient-to-b from-transparent to-black/40` over bottom 60px
- Keep logo overlay top-left
- Fallback: pink gradient when no hero image

### Profile Card
- White card overlapping hero bottom (`-mt-6`, `rounded-3xl`, `shadow-md`)
- Avatar: keep at `w-16 h-16` (64px) with `ring-2 ring-dc-teal`
- **Name**: bold, truncated
- **Rating**: read `average_rating` and `total_reviews` from `creator_profiles` — display as "⭐ {rating} · {count} reviews". If no reviews, show "⭐ New"
- **Location**: unchanged
- **Availability badge**: top-right of card. Green pill "Available" when `availability === 'available'`, gray pill "Busy" otherwise. Hidden if `availability` is null/unset.

### Stats Row
- **Stat 1 — "Projects"**: count of `campaign_collaborations` where `creator_id = profile.user_id`. Simple count query with `.select('id', { count: 'exact' })`
- **Stat 2 — "Portfolio"**: `portfolio_urls.length`
- **Stat 3 — "Reviews"**: `total_reviews` from `creator_profiles`
- **New Creator fallback**: when all three stats are 0, replace entire stats row with a centered teal gradient pill badge: "🌟 New Creator"
- Pink dividers between stats (unchanged)

---

## Section 2: About Card

New white card (`rounded-2xl`, `shadow-sm`) below stats row. Contains:

1. **"About" heading**: bold, dark
2. **Bio text**: from `creator_profiles.bio`. If null/empty, hide entire About card.
3. **Skills tags**: teal pills (`bg-dc-teal text-white rounded-full px-3 py-1 text-xs font-semibold`) rendered from `creator_profiles.skills` array. If empty array, hide tags row.
4. **Rate range**: "💰 $XX / hr" from `base_rate_per_hour`. If null, hide rate line.

Card is hidden entirely if bio, skills, and rate are all empty.

---

## Section 3: Content Showcase (Portfolio Grid)

- **"Portfolio" heading**: bold, dark, above grid
- **Grid**: 3-column, `gap-2`, `rounded-xl` items
- **Show ALL portfolio items** — do not skip the first one (hero image is separate; if no portfolio items exist, hero falls back to avatar or pink gradient)
- **Type badge**: top-left overlay on each item. Detect from file extension:
  - Image extensions (jpg, jpeg, png, gif, webp): "Photo"
  - Video extensions (mp4, mov, webm): "Reel"
  - Fallback: no badge
- **Play overlay**: centered semi-transparent play button on video items
- **Empty state**: when `portfolio_urls` is empty or null, show centered text: "This creator hasn't uploaded portfolio pieces yet" in a muted style
- **Error handling**: keep existing `onError` handler that hides broken images

### Hero image source change
- Hero fallback priority: first portfolio URL > `profile.avatar_url` > pink gradient
- Portfolio grid shows ALL items independently (no longer skipping index 0)

---

## Section 4: Reviews

- **Conditional render**: only show reviews section when `total_reviews > 0`
- **Component**: keep existing `PublicProfileReviews` component — it already handles tabs (Recent/All), `RatingStats`, and `ReviewCard` rendering
- **Wrapping**: wrap in a white card (`rounded-2xl`) with "Reviews" heading for visual consistency
- **When no reviews**: section is completely absent from DOM — no heading, no empty state

---

## Section 5: CTA Buttons

Replace single "GET IN TOUCH" with two buttons:

1. **"Hire This Creator"** (primary): `w-full bg-dc-teal text-white rounded-full h-14 font-bold uppercase tracking-wide` — opens existing `ContactCreatorModal`
2. **"Message"** (secondary): `w-full bg-white text-dc-pink-accent rounded-full h-14 font-bold border-2 border-gray-200` — also opens `ContactCreatorModal`

Both use the same modal and flow. The dual buttons provide clearer intent framing for different user mindsets (hiring vs. casual inquiry). The existing `ContactCreatorModal` already handles auth checks (redirects to login if not authenticated) and self-view prevention — no additional auth gating needed on the buttons.

Bottom padding `pb-8` for safe area.

---

## Data Requirements

### New query needed
- **Completed projects count**: `campaign_collaborations` where `creator_id = profile.user_id`. Simple `.select('id', { count: 'exact' })` call.

### Existing data (no changes)
- `creator_profiles.*` — all fields already fetched with `select('*')`
- `total_reviews` and `average_rating` — already on `creator_profiles`
- `portfolio_urls` — already fetched and converted to public URLs
- `PublicProfileReviews` component — already fetches reviews independently via `useReviews` hook

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/PublicCreatorProfile.tsx` | Main redesign — all sections |

No new files. No changes to other pages or shared components.

---

## Out of Scope

- Browse creators page
- Business dashboard
- Messaging UI
- Creator profile edit form
- Database schema changes (no new tables/columns)
- Social media links display (future enhancement)
- Tabbed navigation (future enhancement if page grows)

---

## Verification

- `npm run build` succeeds
- Profile renders correctly on mobile (375-430px)
- Stats show real data from database
- New creator with no data shows "New Creator" badge
- Reviews hidden when none exist
- Portfolio empty state displays correctly
- Both CTA buttons open ContactCreatorModal
- Availability badge reflects profile data
