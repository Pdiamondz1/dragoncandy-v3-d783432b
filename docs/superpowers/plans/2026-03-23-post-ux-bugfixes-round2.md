# Post-UX Bugfixes Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 bugs/issues remaining after the DragonCandy UX frontend update — broken Edge Function, mobile overflow on 3 pages, squished logo, redundant floating widget, cropped icon, and outdated icon.

**Architecture:** All fixes are independent and can be applied in any order. Priority order: broken functionality (Edge Function), usability (mobile overflow), visual polish (icons/layout). Each task produces a single commit.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase Edge Functions (Deno)

**Spec:** `docs/superpowers/specs/2026-03-23-post-ux-bugfixes-round2-design.md`

---

### Task 1: Diagnose and Fix Donny AI Edge Function Error

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts:989-992`

**Context:** The Edge Function returns "non-2xx status code" when sending messages. The error may be thrown in the try block (hitting the catch/500 handler) or the success response may lack an explicit status code. The user has Supabase dashboard access to check logs.

- [ ] **Step 1: Check Edge Function logs**

Ask the user to open Supabase Dashboard → Edge Functions → donny-chat → Logs. Look for:
- Is the function being invoked at all?
- Is it returning 500 from the catch block? If so, what is `err.message`?
- Is it returning 200 successfully but the client still errors?

- [ ] **Step 2: Add explicit status 200 to success response**

In `supabase/functions/donny-chat/index.ts`, find the success response (~line 989):

```typescript
// BEFORE:
return new Response(
  JSON.stringify({ success: true, content: assistantMessage.content, rich_card: richCard }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

// AFTER:
return new Response(
  JSON.stringify({ success: true, content: assistantMessage.content, rich_card: richCard }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

- [ ] **Step 3: Fix any upstream errors found in logs**

If logs show the catch block is hit, fix based on the error message:
- Missing `OPENAI_API_KEY` → verify secret is set in Supabase Dashboard
- Database table errors → verify `donny_conversations` and `donny_messages` tables exist
- Other errors → fix based on specific error message

- [ ] **Step 4: Deploy and test**

Run: `npx supabase functions deploy donny-chat`

Then test by sending a message to Donny in the app. Verify no "non-2xx status code" error appears and a response is returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "fix: add explicit status 200 to Donny Edge Function success response"
```

---

### Task 2: Fix Mobile Overflow on Creator Earnings Page

**Files:**
- Modify: `src/pages/CreatorEarnings.tsx`

**Context:** The page has `overflow-x-hidden` on the root container (line 225) and the stats grid already has `overflow-hidden` and `min-w-0`. The overflow is coming from another element — likely content exceeding the viewport inside the `bg-white px-4 pt-4 pb-24` container (line 296).

- [ ] **Step 1: Run dev server and inspect at 375px**

Run: `npm run dev`

Open browser DevTools, set viewport to 375px wide. Navigate to Creator Earnings page. Use the element inspector to find which element(s) cause horizontal scroll by:
1. Temporarily adding `* { outline: 1px solid red; }` in DevTools
2. Scrolling right and identifying the element that extends beyond viewport

- [ ] **Step 2: Apply targeted overflow fixes**

Based on the overflowing element found in Step 1, apply the appropriate fix. Common patterns:

For elements with fixed widths or min-widths:
```tsx
// Add max-w-full and min-w-0 to constrain
className="... max-w-full min-w-0"
```

For the page-level container, ensure it constrains children:
```tsx
// Wrap content in a constraining div if needed
<div className="w-full max-w-full overflow-x-hidden">
```

For text that pushes layout:
```tsx
// Add truncate or break-words
className="... truncate"
// or
className="... break-words"
```

- [ ] **Step 3: Verify fix at 375px**

Confirm no horizontal scrollbar at 375px viewport width. Check that content still looks correct and nothing is clipped unexpectedly.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreatorEarnings.tsx
git commit -m "fix: resolve mobile overflow on Creator Earnings page"
```

---

### Task 3: Fix Mobile Overflow on Campaign Wizard

**Files:**
- Modify: `src/pages/CampaignWizard.tsx`
- Potentially modify child step components in `src/components/campaigns/`:
  - `DeliveryTierStep.tsx`
  - `CampaignGoalStep.tsx`
  - `CampaignAnalysisDisplay.tsx`
  - `CampaignCustomizeForm.tsx`
  - `CampaignTimelineBudgetStep.tsx`
  - `CampaignFinalizeStep.tsx`

**Context:** The wizard's outer container (`CampaignWizard.tsx` line 50) already has `overflow-x-hidden`. The overflow is caused by child step components with fixed widths or padding.

- [ ] **Step 1: Inspect each wizard step at 375px**

Navigate through all 6 wizard steps at 375px viewport width. For each step, check:
- Does horizontal scroll appear?
- Which specific element overflows? (use DevTools inspector)

Document which steps overflow and which elements cause it.

- [ ] **Step 2: Fix overflowing elements in step components**

For each overflowing step component, apply targeted fixes:

```tsx
// For form inputs or containers with fixed widths:
className="... w-full max-w-full"

// For flex children that don't shrink:
className="... min-w-0"

// For text that pushes layout:
className="... truncate"
// or
className="... break-words"
```

- [ ] **Step 3: Verify all steps at 375px**

Navigate through all 6 wizard steps again. Confirm no horizontal scrollbar on any step at 375px viewport width.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignWizard.tsx src/components/campaigns/
git commit -m "fix: resolve mobile overflow on Campaign Wizard pages"
```

---

### Task 4: Fix Mobile Overflow on Campaigns Page

**Files:**
- Modify: `src/pages/CampaignsPage.tsx`
- Potentially modify: `src/components/campaigns/CampaignsList.tsx`, `src/components/campaigns/CampaignCard.tsx`

**Context:** The page container (line 102-103) already has `overflow-x-hidden`. The overflow is from campaign cards or the filter tabs.

- [ ] **Step 1: Inspect at 375px**

Navigate to Campaigns page at 375px viewport width. Check:
- Filter tabs row (horizontal scroll area, lines 126-151)
- Campaign cards in the list below
- Which specific element overflows?

- [ ] **Step 2: Fix overflowing elements**

Apply targeted fixes based on findings:

```tsx
// For campaign cards:
className="... w-full max-w-full overflow-hidden"

// For long text in cards:
className="... truncate"

// For the filter tabs container if it overflows:
className="... max-w-full"
```

- [ ] **Step 3: Verify at 375px**

Confirm no horizontal scrollbar at 375px viewport width. Verify filter tabs still scroll horizontally within their container, and campaign cards display correctly.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignsPage.tsx src/components/campaigns/
git commit -m "fix: resolve mobile overflow on Campaigns page"
```

---

### Task 5: Fix Dashboard Logo Squished When Name Is Long

**Files:**
- Modify: `src/components/MobileTopNav.tsx:32`

- [ ] **Step 1: Add flex-shrink-0 to logo**

In `src/components/MobileTopNav.tsx`, find line 32:

```tsx
// BEFORE:
<img src={dragonCandyLogo} alt="DragonCandy" className="h-12 w-12" />

// AFTER:
<img src={dragonCandyLogo} alt="DragonCandy" className="h-12 w-12 flex-shrink-0" />
```

- [ ] **Step 2: Verify with long name**

In browser DevTools, edit the welcome text to a long name like "Christopher Alexander Montgomery III" and confirm:
- Logo stays at full 48x48px size
- Name text truncates with ellipsis
- Layout doesn't break

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileTopNav.tsx
git commit -m "fix: prevent dashboard logo from shrinking when user name is long"
```

---

### Task 6: Remove Floating Donny AI Chat Icon

**Files:**
- Modify: `src/components/DashboardLayout.tsx:254`

**Context:** The `<AIChatModal>` and `useAIChatModal` hook MUST stay — they're used by AskBar (via dashboard pages) and the Ctrl+K keyboard shortcut. Only the `<AIChatWidget>` floating button should be removed.

- [ ] **Step 1: Remove AIChatWidget render and import**

In `src/components/DashboardLayout.tsx`:

1. Remove the `<AIChatWidget>` render (~line 254):
```tsx
// REMOVE this line:
<AIChatWidget userRole={userRole} />
```

2. Update the combined import at ~line 36 to remove `AIChatWidget` (keep `AIChatModal`):
```tsx
// BEFORE:
import { AIChatWidget, AIChatModal } from '@/components/ai-assistant';

// AFTER:
import { AIChatModal } from '@/components/ai-assistant';
```

3. Keep `<AIChatModal>` and `useAIChatModal` — they are still used.

- [ ] **Step 2: Verify**

- Confirm the floating Donny button no longer appears on any dashboard
- Confirm the AskBar "Ask Donny..." button on dashboards still opens the chat modal
- Confirm Ctrl+K / Cmd+K still opens the chat modal
- Confirm the Donny center button in bottom nav still works

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "fix: remove redundant floating Donny AI chat widget"
```

---

### Task 7: Fix Donny AI Center Button Icon (Cropped Dragon Head)

**Files:**
- Modify: `src/components/donny/DonnyNavButton.tsx:18`
- Potentially replace: `src/assets/dragon-emblem.png`

- [ ] **Step 1: Increase icon size**

In `src/components/donny/DonnyNavButton.tsx`, find line 18:

```tsx
// BEFORE:
<img src={dragonEmblem} alt="Donny" className="h-8 w-8 object-contain" />

// AFTER (try h-10 w-10 first):
<img src={dragonEmblem} alt="Donny" className="h-10 w-10 object-contain" />
```

- [ ] **Step 2: Check rendering**

View the bottom nav in the browser at 375px. Verify:
- Dragon head is fully visible (not cropped at top)
- Image fits within the teal gradient circle without overflow
- Image is centered in the circle

If the head is still cropped, try `h-11 w-11` or add `object-position: center top` via `object-top`.

- [ ] **Step 3: Fallback — generate new dragon icon if needed**

If the existing `dragon-emblem.png` can't be made to look right at any size:
- Generate a clean dragon icon SVG matching the DragonCandy logo's teal (#4DD9C0) / green (#00E5CC) color palette
- Save as `src/assets/dragon-emblem.png` (replace existing)
- The icon should be a simple dragon silhouette or head, circular composition, transparent background

- [ ] **Step 4: Commit**

```bash
git add src/components/donny/DonnyNavButton.tsx src/assets/dragon-emblem.png
git commit -m "fix: enlarge Donny nav button icon to show full dragon head"
```

---

### Task 8: Update Ask Donny Dashboard Icon

**Files:**
- Modify: `src/components/ai-assistant/AskBar.tsx:2,21`

- [ ] **Step 1: Replace Search icon with dragon emblem**

In `src/components/ai-assistant/AskBar.tsx`:

```tsx
// BEFORE (line 2):
import { Search } from 'lucide-react';

// AFTER (line 2):
import dragonEmblem from '@/assets/dragon-emblem.png';
```

```tsx
// BEFORE (line 21):
<Search className="w-5 h-5 text-gray-400 flex-shrink-0" />

// AFTER (line 21):
<img src={dragonEmblem} alt="Donny" className="w-6 h-6 flex-shrink-0 object-contain" />
```

Note: Remove the `Search` import from lucide-react if it's no longer used anywhere in this file.

- [ ] **Step 2: Verify on dashboards**

Check the "Ask Donny..." bar on:
- Creator Dashboard
- Business Dashboard
- Brand Dashboard

Verify the dragon emblem icon appears, is sized correctly, and matches the Donny center nav button icon.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-assistant/AskBar.tsx
git commit -m "fix: replace generic Search icon with dragon emblem in Ask Donny bar"
```

---

## Verification Checklist

After all 8 tasks are complete, do a final sweep:

- [ ] Donny AI responds to messages without Edge Function errors
- [ ] No horizontal scroll on Creator Earnings at 375px
- [ ] No horizontal scroll on Campaign Wizard (all steps) at 375px
- [ ] No horizontal scroll on Campaigns page at 375px
- [ ] Dashboard logo stays full size with long user names
- [ ] No floating Donny chat button on any dashboard
- [ ] Ctrl+K and AskBar still open Donny chat modal
- [ ] Dragon head fully visible in bottom nav center button
- [ ] Dragon emblem icon in Ask Donny bar matches center button
- [ ] Run `npm run build` — no TypeScript or build errors
