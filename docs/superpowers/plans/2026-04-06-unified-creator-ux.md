# Unified Creator UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate visual inconsistencies between Creator, Business, and Brand dashboards by replacing gray backgrounds, fixing message bubble colors, unifying the bottom nav to 5 icons, and aligning the Brand dashboard's Donny component.

**Architecture:** Surgical changes to ~14 files. No new components created. Shared components (`DashboardHero`, `DashboardStatsGrid`, `DonnyAIBar`, etc.) are already unified — this plan fixes the remaining divergences in page-level styling and nav configuration.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-06-unified-creator-ux-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50`, fix dependent text-white colors |
| `src/pages/CampaignDetailsPage.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50` (3 occurrences) |
| `src/pages/ProjectDetailsPage.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50` (3 occurrences) |
| `src/pages/PublicBusinessProfile.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50` (3 occurrences) |
| `src/pages/PublicCreatorProfile.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50` (3 occurrences) |
| `src/pages/BrandCampaignDetails.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50` (4 occurrences) |
| `src/pages/NotFound.tsx` | Modify | Replace `bg-dc-gray` → `bg-gray-50`, fix text-white colors |
| `src/pages/BrandMessages.tsx` | Modify | Replace `bg-dc-gray` → `bg-teal-50` (2 occurrences) |
| `src/pages/CampaignMessagesPage.tsx` | Modify | Replace `bg-dc-gray` → `bg-teal-50` (4 occurrences) |
| `src/components/donny/DonnyChatSheet.tsx` | Modify | Replace `bg-[#A8A8A0]` → `bg-teal-50` |
| `src/components/messages/MessageBubble.tsx` | Modify | Sent: `bg-blue-600` → `bg-dc-teal`. Received: `bg-muted` → `bg-dc-pink` |
| `src/lib/navConfig.ts` | Modify | All 3 roles → 5 items, remove `isDonny`, clean unused imports |
| `src/components/MobileBottomNav.tsx` | Modify | Remove Donny icon from center button (use Plus), remove isDonny block. KEEP DonnyChatSheet + event listener |
| `src/pages/BrandDashboard.tsx` | Modify | Replace `DonnyCard` + `AskBar` with shared `DonnyAIBar` |

---

## Task 1: Replace gray backgrounds on general pages

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx:44,57,78`
- Modify: `src/pages/ProjectDetailsPage.tsx:60,78,99`
- Modify: `src/pages/PublicBusinessProfile.tsx:96,108,132`
- Modify: `src/pages/PublicCreatorProfile.tsx:188,200,223`
- Modify: `src/pages/BrandCampaignDetails.tsx:39,49,59,82`

These files have `bg-dc-gray` but NO text-white that depends on the gray background (their text-white is inside teal gradient hero overlays). This is a simple find-and-replace.

- [ ] **Step 1: Replace `bg-dc-gray` with `bg-gray-50` in CampaignDetailsPage.tsx**

Replace all 3 occurrences of `bg-dc-gray` with `bg-gray-50`:
- Line 44: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`
- Line 57: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`
- Line 78: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`

- [ ] **Step 2: Replace `bg-dc-gray` with `bg-gray-50` in ProjectDetailsPage.tsx**

Replace all 3 occurrences:
- Line 60: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`
- Line 78: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`
- Line 99: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`

- [ ] **Step 3: Replace `bg-dc-gray` with `bg-gray-50` in PublicBusinessProfile.tsx**

Replace all 3 occurrences:
- Line 96: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 108: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 132: `bg-dc-gray min-h-screen` → `bg-gray-50 min-h-screen`

- [ ] **Step 4: Replace `bg-dc-gray` with `bg-gray-50` in PublicCreatorProfile.tsx**

Replace all 3 occurrences:
- Line 188: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 200: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 223: `bg-dc-gray min-h-screen` → `bg-gray-50 min-h-screen`

- [ ] **Step 5: Replace `bg-dc-gray` with `bg-gray-50` in BrandCampaignDetails.tsx**

Replace all 4 occurrences:
- Line 39: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 49: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 59: `min-h-screen bg-dc-gray` → `min-h-screen bg-gray-50`
- Line 82: `min-h-screen bg-dc-gray overflow-x-hidden` → `min-h-screen bg-gray-50 overflow-x-hidden`

- [ ] **Step 6: Verify no `bg-dc-gray` remains in these 5 files**

Run: `grep -rn "bg-dc-gray" src/pages/CampaignDetailsPage.tsx src/pages/ProjectDetailsPage.tsx src/pages/PublicBusinessProfile.tsx src/pages/PublicCreatorProfile.tsx src/pages/BrandCampaignDetails.tsx`
Expected: No output (zero matches).

- [ ] **Step 7: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx src/pages/ProjectDetailsPage.tsx src/pages/PublicBusinessProfile.tsx src/pages/PublicCreatorProfile.tsx src/pages/BrandCampaignDetails.tsx
git commit -m "style: replace bg-dc-gray with bg-gray-50 on detail and profile pages"
```

---

## Task 2: Replace gray backgrounds on pages with text-white fixes

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`
- Modify: `src/pages/NotFound.tsx`

These files have text-white that depends on the gray background — both the background AND text colors must change. Use `replace_all` for `bg-dc-gray` and then fix each text-white instance individually.

**Important:** Do NOT change `text-white` on elements with their own colored background (e.g., `bg-dc-teal text-white` on buttons). Only change `text-white` that was relying on the `bg-dc-gray` page background for contrast.

- [ ] **Step 1: Fix CreatorCampaignMarketplace.tsx — background**

Use `replace_all` to change `bg-dc-gray` → `bg-gray-50` (1 occurrence on the page wrapper div).

- [ ] **Step 2: Fix CreatorCampaignMarketplace.tsx — swipe hints (Available tab)**

Replace:
```
<span className="text-xs text-white/50">← Skip</span>
```
with:
```
<span className="text-xs text-gray-400">← Skip</span>
```

Replace:
```
<span className="text-xs text-white/50">View Details →</span>
```
with:
```
<span className="text-xs text-gray-400">View Details →</span>
```

- [ ] **Step 3: Fix CreatorCampaignMarketplace.tsx — Available tab empty state**

Replace:
```
<p className="text-white font-semibold mb-2">No campaigns found</p>
```
with:
```
<p className="text-gray-900 font-semibold mb-2">No campaigns found</p>
```

Replace:
```
<p className="text-white/60 text-sm mb-4">Try different filters or check back soon.</p>
```
with:
```
<p className="text-gray-500 text-sm mb-4">Try different filters or check back soon.</p>
```

- [ ] **Step 4: Fix CreatorCampaignMarketplace.tsx — Applied tab empty state**

Replace:
```
<p className="text-white/70 text-sm mb-2">No applications yet.</p>
```
with:
```
<p className="text-gray-500 text-sm mb-2">No applications yet.</p>
```

- [ ] **Step 5: Fix CreatorCampaignMarketplace.tsx — Active tab empty state**

Replace:
```
<p className="text-white font-semibold mb-2">No active campaigns yet.</p>
```
with:
```
<p className="text-gray-900 font-semibold mb-2">No active campaigns yet.</p>
```

Replace:
```
<p className="text-white/60 text-sm mb-4">When a business accepts your application, your campaign will appear here.</p>
```
with:
```
<p className="text-gray-500 text-sm mb-4">When a business accepts your application, your campaign will appear here.</p>
```

- [ ] **Step 6: Fix CreatorCampaignMarketplace.tsx — Done tab empty state**

Replace:
```
<p className="text-white font-semibold mb-2">No completed campaigns yet.</p>
```
with:
```
<p className="text-gray-900 font-semibold mb-2">No completed campaigns yet.</p>
```

Replace:
```
<p className="text-white/60 text-sm">Your finished campaigns and earnings will show up here.</p>
```
with:
```
<p className="text-gray-500 text-sm">Your finished campaigns and earnings will show up here.</p>
```

- [ ] **Step 7: Fix NotFound.tsx — background and text**

Line 16, replace:
```
<div className="bg-dc-gray min-h-screen flex items-center justify-center p-4">
```
with:
```
<div className="bg-gray-50 min-h-screen flex items-center justify-center p-4">
```

Line 19, replace:
```
<p className="text-xl font-bold text-white">Page not found</p>
```
with:
```
<p className="text-xl font-bold text-gray-900">Page not found</p>
```

Line 20, replace:
```
<p className="text-sm text-white/70">The page you're looking for doesn't exist.</p>
```
with:
```
<p className="text-sm text-gray-500">The page you're looking for doesn't exist.</p>
```

- [ ] **Step 8: Verify no bg-dc-gray or dependent text-white remains**

Run: `grep -rn "bg-dc-gray\|text-white/50\|text-white/60\|text-white/70" src/pages/CreatorCampaignMarketplace.tsx src/pages/NotFound.tsx`
Expected: No output (zero matches). Note: `text-white` on teal buttons (e.g., `bg-dc-teal text-white`) should remain — those have their own background for contrast.

- [ ] **Step 9: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx src/pages/NotFound.tsx
git commit -m "style: replace bg-dc-gray with bg-gray-50 and fix text colors on marketplace and 404"
```

---

## Task 3: Replace gray backgrounds on messaging/chat pages

**Files:**
- Modify: `src/pages/BrandMessages.tsx:23,43`
- Modify: `src/pages/CampaignMessagesPage.tsx:48,68,104,141`
- Modify: `src/components/donny/DonnyChatSheet.tsx:83`

- [ ] **Step 1: Fix BrandMessages.tsx**

Replace both occurrences of `bg-dc-gray` with `bg-teal-50`:
- Line 23: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`
- Line 43: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`

- [ ] **Step 2: Fix CampaignMessagesPage.tsx**

Replace all 4 occurrences of `bg-dc-gray` with `bg-teal-50`:
- Line 48: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`
- Line 68: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`
- Line 104: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`
- Line 141: `overflow-x-hidden bg-dc-gray` → `overflow-x-hidden bg-teal-50`

- [ ] **Step 3: Fix DonnyChatSheet.tsx**

Line 83, replace:
```
<div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-[#A8A8A0]">
```
with:
```
<div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-teal-50">
```

- [ ] **Step 4: Verify no bg-dc-gray or #A8A8A0 remains in these files**

Run: `grep -rn "bg-dc-gray\|bg-\[#A8A8A0\]" src/pages/BrandMessages.tsx src/pages/CampaignMessagesPage.tsx src/components/donny/DonnyChatSheet.tsx`
Expected: No output (zero matches).

- [ ] **Step 5: Commit**

```bash
git add src/pages/BrandMessages.tsx src/pages/CampaignMessagesPage.tsx src/components/donny/DonnyChatSheet.tsx
git commit -m "style: replace gray backgrounds with bg-teal-50 on messaging and Donny chat pages"
```

---

## Task 4: Update message bubble colors to brand teal/pink

**Files:**
- Modify: `src/components/messages/MessageBubble.tsx:58-60`

- [ ] **Step 1: Update sent message bubble**

Line 59, replace:
```
? "bg-blue-600 text-white"
```
with:
```
? "bg-dc-teal text-white"
```

- [ ] **Step 2: Update received message bubble**

Line 60, replace:
```
: "bg-muted text-foreground"
```
with:
```
: "bg-dc-pink text-foreground"
```

- [ ] **Step 3: Verify the change**

Run: `grep -n "bg-blue-600\|bg-muted" src/components/messages/MessageBubble.tsx`
Expected: No output (zero matches for the old colors in bubble area).

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/MessageBubble.tsx
git commit -m "style: update message bubbles to brand teal (sent) and pink (received)"
```

---

## Task 5: Unify bottom nav to 5 icons with role slot

**Files:**
- Modify: `src/lib/navConfig.ts:1-115`

- [ ] **Step 1: Replace all three bottom nav arrays**

Replace the `businessBottomNav`, `creatorBottomNav`, and `brandBottomNav` arrays (lines 83-109) with:

```typescript
export const businessBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Megaphone, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Plus, label: 'Create', href: '/dashboard/business/campaigns/create', isCenter: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];

export const creatorBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/creator' },
  { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: Plus, label: 'Browse', href: '/dashboard/creator/campaigns', isCenter: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/creator/settings' },
];

export const brandBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/brand' },
  { icon: BarChart3, label: 'Analytics', href: '/dashboard/brand/analytics' },
  { icon: Plus, label: 'Discover', href: '/dashboard/brand/discover-campaigns', isCenter: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/brand/settings' },
];
```

- [ ] **Step 2: Remove `isDonny` from BottomNavItem interface**

Line 35, replace:
```typescript
export interface BottomNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
  isDonny?: boolean;
}
```
with:
```typescript
export interface BottomNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
}
```

- [ ] **Step 3: Clean up unused Lucide imports**

Replace the imports block (lines 1-20) with only the icons still used:

```typescript
import {
  LayoutDashboard,
  Target,
  Users,
  MessageSquare,
  Settings,
  Briefcase,
  Image,
  DollarSign,
  Activity,
  BarChart3,
  QrCode,
  Search,
  Plus,
  Megaphone,
  User,
} from 'lucide-react';
```

Removed: `Heart`, `Play`, `List` (no longer used in any nav array). Keep icons still used by sidebar nav arrays.

- [ ] **Step 4: Verify each role has exactly 5 items**

Run: `grep -c "icon:" src/lib/navConfig.ts` — count should reflect 5 items per bottom nav (15 total for bottom navs, plus sidebar items).

- [ ] **Step 5: Commit**

```bash
git add src/lib/navConfig.ts
git commit -m "nav: unify bottom nav to 5 icons with role-specific slot, remove isDonny"
```

---

## Task 6: Update MobileBottomNav to remove Donny icon from center button

**Files:**
- Modify: `src/components/MobileBottomNav.tsx`

**CRITICAL:** `DonnyChatSheet` is the ONLY mount point for the Donny chat UI and the ONLY listener for the `donny-open-chat` custom event (dispatched by `DonnyAIBar` on all dashboards). We MUST keep `DonnyChatSheet`, its state, and its event listener in this component. Only remove the `isDonny` nav button trigger and the Donny mascot image from the center button.

- [ ] **Step 1: Remove DonnyNavButton and donnyIcon imports only**

Remove these two imports:
```typescript
import { DonnyNavButton } from './donny/DonnyNavButton';
import donnyIcon from '@/assets/Donny_icon.png';
```

**KEEP** these imports — they are still needed:
```typescript
import React, { useState, useEffect } from 'react';
import { DonnyChatSheet } from './donny/DonnyChatSheet';
```

Add `Plus` from lucide-react:
```typescript
import { Plus } from 'lucide-react';
```

- [ ] **Step 2: Remove the isDonny conditional block**

Remove the `if (item.isDonny)` block (lines 38-42):
```typescript
if (item.isDonny) {
  return (
    <DonnyNavButton key="donny" onClick={() => setDonnyChatOpen(true)} />
  );
}
```

**KEEP** all the `DonnyChatSheet` state and event listener code (lines 16-26) — this is what makes `DonnyAIBar` work across all dashboards.

**KEEP** the `<DonnyChatSheet>` component at the bottom of the JSX (line 78).

- [ ] **Step 3: Replace center button content — Donny image with Plus icon**

Replace:
```tsx
<span className="bg-dc-teal w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center overflow-hidden">
  <img src={donnyIcon} alt="Create" className="w-10 h-10 object-contain" />
</span>
```
with:
```tsx
<span className="bg-dc-teal w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center">
  <Plus className="w-7 h-7 text-white" />
</span>
```

- [ ] **Step 4: Verify the file compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "nav: replace Donny icon with Plus on center nav button, keep chat sheet"
```

---

## Task 7: Align Brand dashboard to shared DonnyAIBar

**Files:**
- Modify: `src/pages/BrandDashboard.tsx:10-12,112-121`

- [ ] **Step 1: Update imports**

Remove lines 10-12:
```typescript
import { AskBar } from '@/components/ai-assistant';
import { useAIChatModal } from '@/contexts/AIChatModalContext';
import { DonnyCard } from '@/components/donny/DonnyCard';
```

Add:
```typescript
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';
```

- [ ] **Step 2: Remove `openModal` destructure**

Line 17, remove:
```typescript
const { openModal } = useAIChatModal();
```

- [ ] **Step 3: Replace DonnyCard and AskBar with DonnyAIBar**

Replace lines 111-121:
```tsx
{/* Donny AI Card */}
<DonnyCard
  onOpenChat={(message) => {
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message } })
    );
  }}
/>

{/* Ask Bar */}
<AskBar onClick={openModal} userRole="brand" />
```

with:
```tsx
{/* Donny AI Bar */}
<DonnyAIBar placeholder="Ask Donny... 'Show me campaign ROI' or 'Find top creators'" />
```

- [ ] **Step 4: Verify the file compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BrandDashboard.tsx
git commit -m "brand: replace DonnyCard/AskBar with shared DonnyAIBar component"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Verify no bg-dc-gray or #A8A8A0 remains in src/**

Run: `grep -rn "bg-dc-gray\|bg-\[#A8A8A0\]" src/`
Expected: No output (zero matches).

- [ ] **Step 3: Verify no text-white on light backgrounds**

Run: `grep -n "text-white/50\|text-white/60\|text-white/70" src/pages/CreatorCampaignMarketplace.tsx src/pages/NotFound.tsx`
Expected: No output (zero matches — all opacity text-white variants were fixed).

Also spot-check that `text-white font-semibold` (without bg-dc-teal) is gone from CreatorCampaignMarketplace empty states:
Run: `grep -n "text-white font-semibold" src/pages/CreatorCampaignMarketplace.tsx`
Expected: No output (these were changed to `text-gray-900 font-semibold`).

- [ ] **Step 4: Verify bottom nav item counts**

Run: `grep -c "isCenter" src/lib/navConfig.ts`
Expected: `3` (one per role array — confirms each array has exactly one center button).

- [ ] **Step 5: Verify no isDonny or donnyIcon references remain in nav files**

Run: `grep -rn "isDonny\|donnyIcon" src/lib/navConfig.ts src/components/MobileBottomNav.tsx`
Expected: No matches. `DonnyNavButton` import should be gone from MobileBottomNav. `DonnyChatSheet` should still be present (it's the Donny chat mount point).

Run: `grep -n "DonnyChatSheet" src/components/MobileBottomNav.tsx`
Expected: Matches (confirming the chat sheet is still mounted).

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "creator-ux: unified design system with business dashboard"
```
