# DragonCandy Bug Fixes & UX Improvements — May 12, 2026

Four issues affecting Restaurant/Brand and Creator user experience. Each has a confirmed root cause and a targeted fix.

## A. Creator Skill Filter Returns No Matches

### Problem

The Browse Creators page has skill filter pills (Video Editing, Photography, UGC Creation, etc.) and an advanced skills filter panel. Selecting any skill shows zero matching creators, even when creators with those skills exist in the database.

### Root Cause

Data format mismatch. The `creator_profiles.skills` column stores PostgreSQL enum values in snake_case (`video_editing`, `ugc_creation`, `social_media_management`). The filter UI compares against title-case strings (`Video Editing`, `UGC Creation`, `Social Media Management`). The `Array.includes()` check is case-sensitive and always returns false.

### Fix

**Files:**
- `src/components/creator-browse/CreatorBrowseHeader.tsx`
- `src/components/creator-search/AdvancedCreatorFilters.tsx`
- `src/components/creator-browse/CreatorCard.tsx`
- New utility: `src/lib/skillUtils.ts`

**Changes:**

1. Create `src/lib/skillUtils.ts` with:
   - A `SKILL_OPTIONS` array of `{ value: CreatorSkill, label: string }` tuples, matching the existing pattern in `SkillsSelection.tsx`
   - A `formatSkillLabel(skill: string): string` function that converts snake_case to title case for display

2. Change `CONTENT_TYPES` in `CreatorBrowseHeader.tsx` from `string[]` to use `SKILL_OPTIONS`. Pills display `label`, store/compare `value` (snake_case).

3. Change `availableSkills` in `AdvancedCreatorFilters.tsx` to use `SKILL_OPTIONS` the same way.

4. Update `CreatorCard.tsx` skill pills to use `formatSkillLabel()` so `video_editing` displays as `Video Editing`.

5. No changes to `useCreatorBrowse.ts` — the filter comparison already works correctly once both sides use snake_case values.

### Verification

Select "Video Editing" pill → only creators with `video_editing` in their skills array appear. Select multiple pills → intersection filter works. Clear all → shows all creators.

---

## B. Misleading "Content Ready for Review" Banner + Desktop Overflow

### Problem

After a Restaurant hires a Creator, the campaign detail page immediately shows a pink "Content Ready for Your Review" banner with "Review & Approve" and "Request Revision" buttons — even though the Creator hasn't uploaded any content yet. This creates false urgency and confusion.

Additionally, the "Request Revision" button overflows off the right edge of the screen on desktop viewports.

### Root Cause — Status Logic

In `src/lib/campaignPhase.ts:37`, the `deriveCurrentStep()` function has a fallback:

```typescript
return collaboration.content_status ? 'review' : 'hired';
```

Any truthy `content_status` maps to the `'review'` step. After hiring, `content_status` is set to `'pending'` (truthy), so the step immediately becomes `'review'`, which triggers `needsBusinessAction('review') === true`, which produces the pink `action_needed` banner.

### Root Cause — Overflow

In `CampaignStatusBanner.tsx`, the action button row uses `flex-col sm:flex-row gap-2 w-full lg:w-auto` without `flex-wrap`. On desktop viewports where the banner has constrained width, the two buttons can exceed the container.

### Fix

**Files:**
- `src/lib/campaignPhase.ts`
- `src/components/campaigns/detail/CampaignStatusBanner.tsx`

**Logic fix in `deriveCurrentStep()`:**

Replace the catch-all fallback with explicit status mapping:

| `content_status`       | Step          | Rationale                                    |
|------------------------|---------------|----------------------------------------------|
| `null` / `'pending'` / `'in_progress'` | `'hired'`     | Creator hasn't submitted yet                |
| `'submitted'`          | `'review'`    | Content ready for business review            |
| `'approved'` / `'auto_approved'` | `'payment'`   | Content approved, payment phase             |
| `'revision_requested'` | `'submitted'` | Waiting on creator to resubmit              |

This means `needsBusinessAction('hired')` returns `false`, so the banner shows the teal `active` state instead of pink `action_needed`.

**Banner UX for active delivery:**

When `bannerState === 'active'` and `phase === 'active_delivery'`, add contextual props so the banner can display:

- Headline: **"[Creator Name] is working on your content"**
- Subtext: "You'll be notified when content is ready for review"
- No action buttons (nothing for business to do)
- Teal styling (calm, informational)

This requires passing `creatorName` and `phase` to the banner's `active` state rendering logic. The `active` state currently shows generic text; this makes it delivery-aware.

**Overflow fix:**

Add `flex-wrap` to the button row container in the `action_needed` state so buttons wrap on narrow viewports instead of overflowing.

### Verification

1. Hire a creator → banner shows teal "Working on your content" (not pink "Ready for review")
2. Creator submits content → banner transitions to pink "Content Ready for Your Review"
3. On desktop, "Review & Approve" and "Request Revision" buttons stay within bounds
4. Request revision → banner returns to teal "Creator is working on revisions"
5. Creator resubmits → pink review banner reappears

---

## C. Landing Page Flashes on Browser Refresh

### Problem

When an authenticated user refreshes the app on any page, the Landing Page content (header, hero, features) briefly flashes for ~200-500ms before the user is redirected to their dashboard.

### Root Cause

In `src/pages/LandingPage.tsx`, the component renders its full content unconditionally while `AuthContext.loading === true`. The redirect to `/dashboard` only fires via `useEffect` once `!loading && user` evaluates to true. During the auth session restoration window (~200-500ms), the full landing page markup is visible.

The `ProtectedRoute` component handles this correctly (shows a spinner during loading), but the public landing page route at `/` has no such guard.

### Fix

**File:** `src/pages/LandingPage.tsx`

Add an auth-loading guard at the top of the component's render path. While `loading === true`, render a minimal branded splash instead of the full landing page:

- Full-screen container with white background
- DragonCandy logo centered (use existing logo asset from `src/assets/`)
- Spinner component below the logo (reuse existing `Spinner` from `@/components/ui/spinner`)

The existing `useEffect` redirect logic stays unchanged. Once `!loading && user`, navigate to `/dashboard`. Once `!loading && !user`, the splash dissolves and the real landing page renders.

### Verification

1. Log in → navigate to dashboard → refresh browser → no landing page flash; spinner shows briefly, then dashboard loads
2. Log out → visit `/` → landing page renders normally (no spinner, since `loading` resolves quickly to `!user`)

---

## D. Remove PortfolioStrip from Landing Page

### Problem

The bottom of the landing page has a scrollable portfolio/content strip that no one views. It adds page weight and loading time without value.

### Fix

**File:** `src/pages/LandingPage.tsx`

Remove the `PortfolioStrip` import and its `<Suspense>`-wrapped render from the page.

Check `src/components/landing/PortfolioStrip.tsx` for other importers. If none exist, delete the component file.

### Verification

Landing page ends with `BottomCTA`. No scrollable content strip at the bottom. No console errors from removed imports.

---

## Summary

| Issue | Root Cause | Fix Scope | Risk |
|-------|-----------|-----------|------|
| A. Skill filter | snake_case vs title-case mismatch | 4 files + 1 new utility | Low — display-only change |
| B. Status banner | `deriveCurrentStep` truthy fallback + missing flex-wrap | 2 files | Medium — touches state logic |
| C. Auth flash | No loading guard on LandingPage | 1 file | Low — additive guard |
| D. PortfolioStrip | Unused component | 1-2 files (remove) | Low — deletion only |

All fixes are independent and can be implemented and verified in isolation.
