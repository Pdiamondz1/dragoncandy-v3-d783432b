# DragonCandy Post-UX Bugfixes Round 2 — Design Spec

**Date:** 2026-03-23
**Status:** Approved for implementation
**Supersedes:** Fixes 2, 5, and 6 from `2026-03-23-ux-bugfixes-design.md` — those fixes were not fully resolved and are replaced by the corresponding fixes in this spec

---

## Overview

Eight remaining bugs and visual issues after the DragonCandy UX frontend update. Fixes are ordered by impact: broken functionality first, then usability, then visual polish.

---

## Fix 1: Donny AI Edge Function Error

**Problem:** Sending a message to Donny AI returns "Edge Function returned a non-2xx status code".

**Likely Root Cause:** The error may be thrown before the success response is reached — the `catch` block returns a 500 status. Alternatively, the success response at ~line 987 omits an explicit `status: 200`, which Supabase's `functions.invoke()` may misinterpret.

**Fix (diagnostic-first approach):**
1. Check Supabase Edge Function logs to determine whether the function is hitting the catch block (500) or returning success without an explicit status
2. If the error is thrown in the try block: fix the upstream issue based on log output (e.g., missing secrets, database errors, OpenAI API failures)
3. As a defensive measure, add `status: 200` to the success `Response` options object
4. Test end-to-end by sending a message in the app

**Files modified:**
- `supabase/functions/donny-chat/index.ts` — fix based on diagnostic findings, plus add explicit status code

---

## Fix 2: Mobile Overflow on Creator Earnings Page

**Problem:** Horizontal overflow/scrolling at mobile viewport widths (375px).

**Root Cause:** The stats grid already has `overflow-hidden` and `min-w-0` on children, so the overflow is likely coming from another element on the page (not the stats grid itself).

**Fix (audit-based):**
- Use browser DevTools at 375px viewport width to identify the actual overflowing element(s)
- Apply targeted fixes: `max-w-full`, `overflow-hidden`, `min-w-0`, or text truncation as needed
- Wrap the page content container with `max-w-screen overflow-x-hidden` if not already present
- Test criterion: no horizontal scrollbar at 375px viewport width

**Files modified:**
- `src/pages/CreatorEarnings.tsx`

---

## Fix 3: Mobile Overflow on Campaign Wizard

**Problem:** Horizontal overflow/scrolling at mobile viewport widths.

**Root Cause:** The wizard outer container already has `overflow-x-hidden`, so the overflow is caused by child form components within individual wizard steps that have fixed widths, `min-w-*` constraints, or padding that pushes beyond the viewport. Exact elements to be identified during implementation.

**Fix (audit-based):**
- Use browser DevTools at 375px viewport width to identify the overflowing elements within each wizard step
- Apply targeted fixes per element: `w-full`, `max-w-full`, `min-w-0`, or remove fixed widths
- Ensure all form inputs and buttons respect container width
- Test criterion: no horizontal scrollbar at 375px viewport width across all wizard steps

**Files modified:**
- `src/pages/CampaignWizard.tsx`
- Potentially child step components (identified during implementation)

---

## Fix 4: Mobile Overflow on Campaigns Page

**Problem:** Horizontal overflow/scrolling at mobile viewport widths.

**Root Cause:** The page container likely already has `overflow-x-hidden`, so the overflow is caused by specific elements within campaign cards or the list layout. Exact elements to be identified during implementation.

**Fix (audit-based):**
- Use browser DevTools at 375px viewport width to identify the overflowing elements
- Apply targeted fixes: `w-full max-w-full`, text truncation, or remove fixed widths as needed
- Test criterion: no horizontal scrollbar at 375px viewport width

**Files modified:**
- `src/pages/CampaignsPage.tsx`
- Potentially `src/components/campaigns/CampaignsList.tsx` or child card components

---

## Fix 5: Dashboard Logo Squished When Name Is Long

**Problem:** The DragonCandy logo in `MobileTopNav.tsx` gets compressed when the user's display name is long.

**Root Cause:** The logo `<img>` lacks `flex-shrink-0`, so the flex layout allows the center text div to compress the logo.

**Fix:**
- Add `flex-shrink-0` to the logo `<img>` element (or its parent `<Link>`)
- The welcome text div already has `truncate` — no change needed there

**Files modified:**
- `src/components/MobileTopNav.tsx` (~line 32)

---

## Fix 6: Remove Floating Donny AI Chat Icon

**Problem:** The floating `AIChatWidget` button still renders on dashboards, duplicating the Donny AI access that now lives in the bottom nav center button.

**Fix:**
- Remove the `<AIChatWidget>` render from `DashboardLayout.tsx` (~line 254)
- **Do NOT remove `<AIChatModal>` or the `useAIChatModal` hook** — multiple dashboard pages (CreatorDashboard, BrandDashboard, BusinessDashboard) call `openModal` directly, and DashboardLayout uses it for the Ctrl+K shortcut. Only the `<AIChatWidget>` floating button should be removed.
- Remove corresponding imports for any removed components
- Leave the `AIChatWidget.tsx` and `AIChatModal.tsx` component files in place (no dead code cleanup this round)

**Files modified:**
- `src/components/DashboardLayout.tsx`

---

## Fix 7: Donny AI Center Button Icon Cropped

**Problem:** The dragon head is cut off at the top in the bottom nav center button.

**Root Cause:** The dragon emblem image in `DonnyNavButton.tsx` is sized `h-8 w-8` (32px) inside a `w-14 h-14` (56px) container, which is too small for the dragon head detail.

**Fix:**
- Increase the image size to `h-10 w-10` or `h-11 w-11` while preserving `object-contain` to prevent distortion
- Adjust `object-position` if the head is still top-heavy after resizing
- If the existing `dragon-emblem.png` doesn't render well at larger sizes, generate a clean dragon icon matching the DragonCandy logo's teal/green color and style

**Fallback:** If the existing emblem image can't be made to look correct, generate a closely identical dragon icon with the same color palette and style as the DragonCandy logo.

**Files modified:**
- `src/components/donny/DonnyNavButton.tsx`
- Potentially `src/assets/dragon-emblem.png` (replacement if needed)

---

## Fix 8: Ask Donny Dashboard Icon Outdated

**Problem:** The "Ask Donny" bar on dashboards uses a generic `<Search>` lucide icon instead of the DragonCandy dragon logo.

**Fix:**
- Replace the `<Search>` icon in `AskBar.tsx` with an `<img>` tag using the same `dragonEmblem` image from `DonnyNavButton`
- Size it at `w-6 h-6` (slightly larger than the current `w-5 h-5` Search icon) for visibility, preserving `flex-shrink-0`
- Same fallback as Fix 7: if the emblem doesn't render well, use a generated dragon icon

**Files modified:**
- `src/components/ai-assistant/AskBar.tsx`

---

## Out of Scope

- New features or functionality changes
- Database schema changes
- Desktop layout changes
- Pages not listed (overflow audit of other pages deferred to next pass)
- Dead code cleanup of removed floating widget components
