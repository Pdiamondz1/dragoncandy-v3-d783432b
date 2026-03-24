# Mobile Overflow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix horizontal overflow on 4 mobile pages by adding Tailwind overflow constraints and repositioning absolutely-positioned badges.

**Architecture:** Targeted CSS-only fixes — add `overflow-hidden`, `max-w-full`, `break-words` to containers and text elements, reposition two badges from outside card boundaries to inside.

**Tech Stack:** React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-23-mobile-overflow-fixes-design.md`

---

## File Map

All changes are modifications to existing files. No new files created.

| File | Responsibility |
|------|---------------|
| `src/pages/DirectMessagesPage.tsx` | Messages page — conversation list wrapper |
| `src/components/campaigns/CampaignWizardHeader.tsx` | Campaign Wizard — header text and description |
| `src/components/campaigns/DeliveryTierStep.tsx` | Campaign Wizard — delivery tier cards and Premium badge |
| `src/components/campaigns/CampaignCard.tsx` | Campaigns list — card root and counter badge |
| `src/pages/CampaignDetailsPage.tsx` | Campaign Details — card overlay and title |

---

### Task 1: Fix Messages page overflow

**Files:**
- Modify: `src/pages/DirectMessagesPage.tsx:86`

- [ ] **Step 1: Add `overflow-hidden` to conversation list wrapper**

In `src/pages/DirectMessagesPage.tsx`, line 86, change:
```tsx
<div className="pb-24 px-4 pt-4">
```
to:
```tsx
<div className="pb-24 px-4 pt-4 overflow-hidden">
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/DirectMessagesPage.tsx
git commit -m "fix: add overflow-hidden to Messages page conversation list wrapper"
```

---

### Task 2: Fix Campaign Wizard header overflow

**Files:**
- Modify: `src/components/campaigns/CampaignWizardHeader.tsx:22,24`

- [ ] **Step 1: Add `max-w-full overflow-hidden` to header text div**

In `src/components/campaigns/CampaignWizardHeader.tsx`, line 22, change:
```tsx
<div className="text-center mb-8">
```
to:
```tsx
<div className="text-center mb-8 max-w-full overflow-hidden">
```

- [ ] **Step 2: Add `break-words` to description paragraph**

In the same file, line 24, change:
```tsx
<p className="text-gray-600">
```
to:
```tsx
<p className="text-gray-600 break-words">
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignWizardHeader.tsx
git commit -m "fix: add overflow constraints to Campaign Wizard header text"
```

---

### Task 3: Fix DeliveryTierStep overflow and Premium badge clipping

**Files:**
- Modify: `src/components/campaigns/DeliveryTierStep.tsx:67,96`

- [ ] **Step 1: Add `overflow-hidden` to outer wrapper**

In `src/components/campaigns/DeliveryTierStep.tsx`, line 67, change:
```tsx
<div className="space-y-6">
```
to:
```tsx
<div className="space-y-6 overflow-hidden">
```

- [ ] **Step 2: Reposition Premium badge inside card boundary**

In the same file, line 96, change:
```tsx
<div className="absolute -top-2 -right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium z-10">
```
to:
```tsx
<div className="absolute top-2 right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium z-10">
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/DeliveryTierStep.tsx
git commit -m "fix: add overflow-hidden to DeliveryTierStep and reposition Premium badge"
```

---

### Task 4: Fix CampaignCard overflow and counter badge clipping

**Files:**
- Modify: `src/components/campaigns/CampaignCard.tsx:224,227`

- [ ] **Step 1: Add `overflow-hidden` to root Card**

In `src/components/campaigns/CampaignCard.tsx`, line 224, the Card element has a long conditional className. Add `overflow-hidden` after `relative`:
```tsx
<Card className={`relative overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 ${needsEscrowPayment ? 'border-l-amber-500 bg-amber-50/30' : 'border-l-transparent hover:border-l-primary/50'}`}>
```

- [ ] **Step 2: Reposition application counter badge inside card boundary**

In the same file, line 227, change:
```tsx
<div className="absolute -top-2 -right-2 z-10">
```
to:
```tsx
<div className="absolute top-2 right-2 z-10">
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignCard.tsx
git commit -m "fix: add overflow-hidden to CampaignCard and reposition counter badge"
```

---

### Task 5: Fix Campaign Details page overflow

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx:107,110`

- [ ] **Step 1: Add `overflow-hidden` to white card overlay**

In `src/pages/CampaignDetailsPage.tsx`, line 107, change:
```tsx
<div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28">
```
to:
```tsx
<div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 overflow-hidden">
```

- [ ] **Step 2: Add `break-words` to campaign title**

In the same file, line 110, change:
```tsx
<h2 className="text-xl font-bold text-gray-900">{campaign.title}</h2>
```
to:
```tsx
<h2 className="text-xl font-bold text-gray-900 break-words">{campaign.title}</h2>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "fix: add overflow-hidden and break-words to Campaign Details page"
```

---

### Task 6: Visual verification

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify all 4 pages at 375px viewport width**

Open each page in browser DevTools with device toolbar set to 375px width:
1. Messages page (`/dashboard/business/messages`) — no horizontal scroll
2. Campaign Wizard (`/dashboard/business/campaigns/create`) — no horizontal scroll, Premium badge visible inside card
3. Campaigns list (`/dashboard/business/campaigns`) — no horizontal scroll, counter badge visible inside card
4. Campaign Details (click any campaign) — no horizontal scroll, long titles wrap

Run in console: `document.documentElement.scrollWidth === document.documentElement.clientWidth` — should return `true` on each page.

- [ ] **Step 3: Verify desktop layout is unaffected**

Resize to 1280px+ width and spot-check the same 4 pages. No visual regressions.
