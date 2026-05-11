# White Backgrounds & Collapsible Brief Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace gray page backgrounds with white and make campaign brief sections collapsible with animated expand/collapse.

**Architecture:** Two independent changes. Change 1 is a 3-line CSS swap in one file. Change 2 creates a `CollapsibleBriefSection` wrapper component using Radix Collapsible, registers animation keyframes in Tailwind, wraps the 4 brief sections in the parent component, and strips the now-redundant heading/wrapper from each section component.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix UI Collapsible (`@radix-ui/react-collapsible`), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-11-white-bg-collapsible-brief-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/campaign-details/CollapsibleBriefSection.tsx` | Reusable wrapper: title trigger + chevron + animated collapsible content |

### Modified Files
| File | Change |
|------|--------|
| `src/pages/MyCampaignDetailPage.tsx` | Replace 3× `bg-gray-300` with `bg-white` |
| `tailwind.config.ts` | Add `collapsible-down` / `collapsible-up` keyframes and animation utilities |
| `src/components/campaign-details/sections/CampaignOverviewSection.tsx` | Remove `<h3>` heading and outer `<div className="space-y-3">` wrapper |
| `src/components/campaign-details/sections/ContentRequirementsSection.tsx` | Remove `<h3>` heading and outer `<div className="space-y-3">` wrapper |
| `src/components/campaign-details/sections/CompensationSection.tsx` | Remove `<h3>` heading and outer `<div className="space-y-3">` wrapper |
| `src/components/campaign-details/sections/LogisticsSection.tsx` | Remove `<h3>` heading and outer `<div className="space-y-3">` wrapper |
| `src/components/campaign-details/CreatorCampaignDetails.tsx` | Import `CollapsibleBriefSection`, wrap each of the 4 sections |

---

## Task 1: Replace gray backgrounds with white

**Files:**
- Modify: `src/pages/MyCampaignDetailPage.tsx:72,81,92`

- [ ] **Step 1: Replace all three `bg-gray-300` instances**

In `src/pages/MyCampaignDetailPage.tsx`, make these three replacements:

Line 72 — loading skeleton container:
```typescript
// BEFORE:
      <div className="min-h-screen bg-gray-300 p-4 space-y-4">
// AFTER:
      <div className="min-h-screen bg-white p-4 space-y-4">
```

Line 81 — not-found fallback:
```typescript
// BEFORE:
      <div className="min-h-screen bg-gray-300 flex items-center justify-center">
// AFTER:
      <div className="min-h-screen bg-white flex items-center justify-center">
```

Line 92 — main page wrapper:
```typescript
// BEFORE:
    <div className="min-h-screen bg-gray-300">
// AFTER:
    <div className="min-h-screen bg-white">
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyCampaignDetailPage.tsx
git commit -m "fix: replace gray page backgrounds with white on campaign detail page"
```

---

## Task 2: Add collapsible animation keyframes to Tailwind

**Files:**
- Modify: `tailwind.config.ts:126,136`

- [ ] **Step 1: Add keyframes**

In `tailwind.config.ts`, inside the `keyframes` object (after the `'slide-up'` entry at line 124), add:

```typescript
				'collapsible-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-collapsible-content-height)' },
				},
				'collapsible-up': {
					from: { height: 'var(--radix-collapsible-content-height)' },
					to: { height: '0' },
				},
```

- [ ] **Step 2: Add animation utilities**

In the same file, inside the `animation` object (after the `'slide-up'` entry at line 135), add:

```typescript
				'collapsible-down': 'collapsible-down 0.2s ease-out',
				'collapsible-up': 'collapsible-up 0.2s ease-out',
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, new animation classes available.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add collapsible-down/up animation keyframes for Radix Collapsible"
```

---

## Task 3: Create CollapsibleBriefSection component

**Files:**
- Create: `src/components/campaign-details/CollapsibleBriefSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/campaign-details/CollapsibleBriefSection.tsx`:

```typescript
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

interface CollapsibleBriefSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleBriefSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleBriefSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 group">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
          {title}
        </h3>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build (component not imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/CollapsibleBriefSection.tsx
git commit -m "feat: add CollapsibleBriefSection wrapper with animated chevron"
```

---

## Task 4: Strip headings and outer wrappers from section components

**Files:**
- Modify: `src/components/campaign-details/sections/CampaignOverviewSection.tsx`
- Modify: `src/components/campaign-details/sections/ContentRequirementsSection.tsx`
- Modify: `src/components/campaign-details/sections/CompensationSection.tsx`
- Modify: `src/components/campaign-details/sections/LogisticsSection.tsx`

Each section currently returns:
```tsx
<div className="space-y-3">
  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Title</h3>
  <div className="bg-white rounded-xl border border-gray-200 p-4 ...">
    ...content...
  </div>
</div>
```

After this task, each returns only the inner card:
```tsx
<div className="bg-white rounded-xl border border-gray-200 p-4 ...">
  ...content...
</div>
```

- [ ] **Step 1: Strip CampaignOverviewSection**

In `src/components/campaign-details/sections/CampaignOverviewSection.tsx`, change the return from:

```typescript
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Campaign Overview</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
```
(with closing `</div></div>`)

To:

```typescript
  return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
```
(with single closing `</div>`)

Remove the outer `<div className="space-y-3">` wrapper and `<h3>` heading entirely. The component's return becomes just the inner card `<div>`.

- [ ] **Step 2: Strip ContentRequirementsSection**

In `src/components/campaign-details/sections/ContentRequirementsSection.tsx`, same pattern. Change:

```typescript
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Content Requirements</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
```

To:

```typescript
  return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
```

Remove outer wrapper and heading, keep only the inner card `<div>` (note: `space-y-4` not `space-y-3` in this one).

- [ ] **Step 3: Strip CompensationSection**

In `src/components/campaign-details/sections/CompensationSection.tsx`, same pattern. Change:

```typescript
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Compensation & Terms</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
```

To:

```typescript
  return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
```

- [ ] **Step 4: Strip LogisticsSection**

In `src/components/campaign-details/sections/LogisticsSection.tsx`, same pattern. Change:

```typescript
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Logistics & Targeting</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
```

To:

```typescript
  return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build. The sections are still rendered from `CreatorCampaignDetails` — they just no longer have their own headings.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaign-details/sections/CampaignOverviewSection.tsx src/components/campaign-details/sections/ContentRequirementsSection.tsx src/components/campaign-details/sections/CompensationSection.tsx src/components/campaign-details/sections/LogisticsSection.tsx
git commit -m "refactor: strip headings and outer wrappers from brief section components"
```

---

## Task 5: Wrap sections in CollapsibleBriefSection in CreatorCampaignDetails

**Files:**
- Modify: `src/components/campaign-details/CreatorCampaignDetails.tsx`

- [ ] **Step 1: Add import**

At the top of `src/components/campaign-details/CreatorCampaignDetails.tsx`, add:

```typescript
import { CollapsibleBriefSection } from './CollapsibleBriefSection';
```

- [ ] **Step 2: Wrap each section**

In the `<div className="px-5 pt-4 pb-6 space-y-5">` block (lines 50-76), wrap each of the 4 sections:

Change:
```typescript
      <div className="px-5 pt-4 pb-6 space-y-5">
        <CampaignOverviewSection campaign={campaign} />

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
        <CompensationSection campaign={campaign} campaignId={campaign.id} role="creator" />
        <LogisticsSection campaign={campaign} />

        {enrichedDetail?.businessProfile && (
          <div className="mt-3">
            <BusinessProfileStrip
              profile={enrichedDetail.businessProfile}
              completedCampaignCount={enrichedDetail.completedCampaignCount}
            />
          </div>
        )}
      </div>
```

To:
```typescript
      <div className="px-5 pt-4 pb-6 space-y-5">
        <CollapsibleBriefSection title="Campaign Overview" defaultOpen>
          <CampaignOverviewSection campaign={campaign} />
        </CollapsibleBriefSection>

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <CollapsibleBriefSection title="Content Requirements">
          <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
        </CollapsibleBriefSection>

        <CollapsibleBriefSection title="Compensation & Terms">
          <CompensationSection campaign={campaign} campaignId={campaign.id} role="creator" />
        </CollapsibleBriefSection>

        <CollapsibleBriefSection title="Logistics & Targeting">
          <LogisticsSection campaign={campaign} />
        </CollapsibleBriefSection>

        {enrichedDetail?.businessProfile && (
          <div className="mt-3">
            <BusinessProfileStrip
              profile={enrichedDetail.businessProfile}
              completedCampaignCount={enrichedDetail.completedCampaignCount}
            />
          </div>
        )}
      </div>
```

Note: `CampaignReferencesGallery`, `CampaignFootageSection`, and `BusinessProfileStrip` are NOT wrapped — they are not "brief sections" with headings; they're visual media blocks and profile strips.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/CreatorCampaignDetails.tsx
git commit -m "feat: wrap brief sections in CollapsibleBriefSection with first-expanded default"
```

---

## Task 6: Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Start dev server and test**

Run: `npm run dev`

Test the following:

1. **My Campaign Detail page background:** Navigate to any campaign detail at `/dashboard/creator/my-campaigns/:id`. Background should be white, not gray.

2. **Campaign brief — first section expanded:** The Campaign Overview section should be visible (expanded) by default.

3. **Campaign brief — other sections collapsed:** Content Requirements, Compensation & Terms, and Logistics & Targeting should be collapsed. Only their title + chevron visible.

4. **Expand/collapse animation:** Tap a collapsed section header. It should smoothly animate open. Chevron should rotate to point up. Tap again — it should animate closed.

5. **Pre-apply marketplace view:** Open a campaign from the Marketplace (Browse Campaigns). The detail modal also uses `CreatorCampaignDetails` — verify collapsible sections work there too.

6. **Business side unaffected:** Navigate to the business dashboard. No visual changes.

- [ ] **Step 3: Fix any issues found during testing**

Address any TypeScript errors, animation glitches, or UI issues. Each fix as a separate commit.
