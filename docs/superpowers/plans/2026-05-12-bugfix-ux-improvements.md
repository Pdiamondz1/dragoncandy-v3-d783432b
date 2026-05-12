# Bug Fixes & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 bugs: skill filter mismatch, misleading campaign status banner, landing page auth flash, and remove unused PortfolioStrip.

**Architecture:** Pure frontend fixes. No database migrations. Three independent workstreams: (A) skill filter data-format alignment, (B) campaign phase logic + banner UX, (C) landing page loading guard + cleanup.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-05-12-bugfix-ux-improvements-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/skillUtils.ts` | Shared skill enum-to-label mapping and format utility |
| Modify | `src/components/creator-browse/CreatorBrowseHeader.tsx` | Content-type pill filters — use snake_case values |
| Modify | `src/components/creator-search/AdvancedCreatorFilters.tsx` | Advanced skill filter badges — use snake_case values |
| Modify | `src/components/creator-browse/CreatorCard.tsx` | Display formatted skill labels |
| Modify | `src/components/brand-browse/BrandCreatorCard.tsx` | Display formatted skill labels |
| Modify | `src/components/brand-browse/ShortlistDrawer.tsx` | Display formatted skill labels |
| Modify | `src/components/campaigns/ApplicationCard.tsx` | Display formatted skill labels |
| Modify | `src/components/campaigns/CreatorMatchCard.tsx` | Display formatted skill labels |
| Modify | `src/components/campaigns/CreatorMatchingSection.tsx` | Display formatted skill labels |
| Modify | `src/components/campaigns/CreatorProfileModal.tsx` | Display formatted skill labels |
| Modify | `src/components/creator-browse/CreatorProfileModal.tsx` | Display formatted skill labels |
| Modify | `src/components/creator-browse/CreatorMapView.tsx` | Display formatted skill labels |
| Modify | `src/lib/campaignPhase.ts` | Fix `deriveCurrentStep()` fallback logic |
| Modify | `src/components/campaigns/detail/CampaignStatusBanner.tsx` | Active delivery UX + overflow fix |
| Modify | `src/pages/LandingPage.tsx` | Auth loading guard + remove PortfolioStrip |
| Delete | `src/components/landing/PortfolioStrip.tsx` | Unused component removal |
| Delete | `src/hooks/useCreatorPortfolioFeed.ts` | Orphaned hook (only used by PortfolioStrip) |

---

## Task 1: Create Skill Utility + Fix Filters

### Task 1a: Create `src/lib/skillUtils.ts`

**Files:**
- Create: `src/lib/skillUtils.ts`

- [ ] **Step 1: Create the skill utility file**

```typescript
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export const SKILL_OPTIONS: { value: CreatorSkill; label: string }[] = [
  { value: 'video_editing', label: 'Video Editing' },
  { value: 'photography', label: 'Photography' },
  { value: 'ugc_creation', label: 'UGC Creation' },
  { value: 'social_media_management', label: 'Social Media Management' },
  { value: 'copywriting', label: 'Copywriting' },
  { value: 'graphic_design', label: 'Graphic Design' },
  { value: 'animation', label: 'Animation' },
  { value: 'content_strategy', label: 'Content Strategy' },
  { value: 'influencer_marketing', label: 'Influencer Marketing' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'other', label: 'Other' },
];

const skillLabelMap = new Map(SKILL_OPTIONS.map(s => [s.value, s.label]));

export function formatSkillLabel(skill: string): string {
  return skillLabelMap.get(skill as CreatorSkill) ?? skill.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/skillUtils.ts
git commit -m "feat: add shared skill utility for enum-to-label mapping"
```

---

### Task 1b: Fix Content-Type Pill Filters

**Files:**
- Modify: `src/components/creator-browse/CreatorBrowseHeader.tsx:5-14`

- [ ] **Step 1: Replace CONTENT_TYPES with SKILL_OPTIONS import**

Replace lines 5-14 of `CreatorBrowseHeader.tsx`:

```typescript
// OLD:
const CONTENT_TYPES = [
  'Video Editing',
  'Photography',
  'UGC Creation',
  'Social Media Management',
  'Copywriting',
  'Graphic Design',
  'Animation',
  'Content Strategy',
];
```

With:

```typescript
import { SKILL_OPTIONS } from '@/lib/skillUtils';

const CONTENT_TYPES = SKILL_OPTIONS
  .filter(s => s.value !== 'other' && s.value !== 'influencer_marketing' && s.value !== 'illustration')
  .map(s => ({ value: s.value, label: s.label }));
```

- [ ] **Step 2: Update pill rendering to use value/label**

In the same file, update the pills section (around lines 105-117).

Replace:

```tsx
{CONTENT_TYPES.map((type) => (
  <button
    key={type}
    onClick={() => toggleContentType(type)}
    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
      contentTypeFilter.includes(type)
        ? 'bg-teal-400 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {type}
  </button>
))}
```

With:

```tsx
{CONTENT_TYPES.map(({ value, label }) => (
  <button
    key={value}
    onClick={() => toggleContentType(value)}
    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
      contentTypeFilter.includes(value)
        ? 'bg-teal-400 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
))}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-browse/CreatorBrowseHeader.tsx
git commit -m "fix: content-type pills use snake_case values matching DB enums"
```

---

### Task 1c: Fix Advanced Skills Filter

**Files:**
- Modify: `src/components/creator-search/AdvancedCreatorFilters.tsx:95-106, 207-216`

- [ ] **Step 1: Replace availableSkills with SKILL_OPTIONS import**

Add import at top of file:

```typescript
import { SKILL_OPTIONS } from '@/lib/skillUtils';
```

Replace the `availableSkills` array (lines 95-106):

```typescript
// OLD:
const availableSkills = [
  'Video Editing',
  'Photography',
  'Graphic Design',
  'Copywriting',
  'Social Media Management',
  'UGC Creation',
  'Animation',
  'Influencer Marketing',
  'Content Strategy',
  'Illustration'
];
```

With:

```typescript
const availableSkills = SKILL_OPTIONS.filter(s => s.value !== 'other');
```

- [ ] **Step 2: Update Badge rendering to use value/label**

Replace the skills rendering section (around lines 207-216):

```tsx
{availableSkills.map(skill => (
  <Badge
    key={skill}
    variant={filters.skills?.includes(skill) ? "default" : "outline"}
    className="cursor-pointer"
    onClick={() => toggleSkill(skill)}
  >
    {skill}
  </Badge>
))}
```

With:

```tsx
{availableSkills.map(({ value, label }) => (
  <Badge
    key={value}
    variant={filters.skills?.includes(value) ? "default" : "outline"}
    className="cursor-pointer"
    onClick={() => toggleSkill(value)}
  >
    {label}
  </Badge>
))}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-search/AdvancedCreatorFilters.tsx
git commit -m "fix: advanced skills filter uses snake_case values matching DB enums"
```

---

### Task 1d: Fix Skill Display in Creator Cards and Modals

**Files:**
- Modify: `src/components/creator-browse/CreatorCard.tsx:172-178`
- Modify: `src/components/brand-browse/BrandCreatorCard.tsx` (same pattern)
- Modify: `src/components/brand-browse/ShortlistDrawer.tsx:168`
- Modify: `src/components/campaigns/ApplicationCard.tsx:162`
- Modify: `src/components/campaigns/CreatorMatchCard.tsx:159`
- Modify: `src/components/campaigns/CreatorMatchingSection.tsx:361`
- Modify: `src/components/campaigns/CreatorProfileModal.tsx:79`
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx:290`
- Modify: `src/components/creator-browse/CreatorMapView.tsx:244`

- [ ] **Step 1: Add formatSkillLabel to all skill-rendering components**

In every file listed above, add this import:

```typescript
import { formatSkillLabel } from '@/lib/skillUtils';
```

Then wrap every raw `{skill}` display with `{formatSkillLabel(skill)}`.

**Specific patterns to find-and-replace per file:**

`CreatorCard.tsx` — line 176:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

`BrandCreatorCard.tsx` — same pattern as CreatorCard, wrap skill display.

`ShortlistDrawer.tsx` — line 168:
```tsx
// OLD:  {(rc.creator.skills ?? []).slice(0, 2).join(', ')}
// NEW:  {(rc.creator.skills ?? []).slice(0, 2).map(formatSkillLabel).join(', ')}
```

`ApplicationCard.tsx` — inside the skills.map:
```tsx
// OLD:  {skill}  (or the skill string rendered inline)
// NEW:  {formatSkillLabel(skill)}
```

`CreatorMatchCard.tsx` — inside the skills.slice(0,4).map:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

`CreatorMatchingSection.tsx` — inside the skills.slice(0,4).map:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

`CreatorProfileModal.tsx` (campaigns) — inside skills.map:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

`CreatorProfileModal.tsx` (creator-browse) — inside skills.map:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

`CreatorMapView.tsx` — inside skills.slice(0,3).map:
```tsx
// OLD:  {skill}
// NEW:  {formatSkillLabel(skill)}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-browse/CreatorCard.tsx src/components/brand-browse/BrandCreatorCard.tsx src/components/brand-browse/ShortlistDrawer.tsx src/components/campaigns/ApplicationCard.tsx src/components/campaigns/CreatorMatchCard.tsx src/components/campaigns/CreatorMatchingSection.tsx src/components/campaigns/CreatorProfileModal.tsx src/components/creator-browse/CreatorProfileModal.tsx src/components/creator-browse/CreatorMapView.tsx
git commit -m "fix: display formatted skill labels across all creator components"
```

---

## Task 2: Fix Campaign Status Banner

### Task 2a: Fix `deriveCurrentStep()` Logic

**Files:**
- Modify: `src/lib/campaignPhase.ts:24-38`

- [ ] **Step 1: Replace deriveCurrentStep function**

Replace lines 24-38 of `campaignPhase.ts`:

```typescript
// OLD:
export function deriveCurrentStep(collaboration: {
  status: string;
  content_status?: string | null;
  business_completion_status?: string | null;
  creator_completion_status?: string | null;
}): ProjectStep {
  if (collaboration.status === 'completed') return 'review_left';
  if (
    collaboration.business_completion_status === 'requested' ||
    collaboration.creator_completion_status === 'requested'
  ) return 'payment';
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  return collaboration.content_status ? 'review' : 'hired';
}
```

With:

```typescript
export function deriveCurrentStep(collaboration: {
  status: string;
  content_status?: string | null;
  business_completion_status?: string | null;
  creator_completion_status?: string | null;
}): ProjectStep {
  if (collaboration.status === 'completed') return 'review_left';
  if (
    collaboration.business_completion_status === 'requested' ||
    collaboration.creator_completion_status === 'requested'
  ) return 'payment';
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  if (collaboration.content_status === 'rejected') return 'payment';
  // pending, in_progress, revision_requested, or null → creator is still working
  return 'hired';
}
```

Key changes:
- Removed `auto_approved` — it's not a valid `content_status` column value (only exists in per-deliverable JSONB status)
- Added `rejected` — valid column value that maps to payment phase (refund/resolution)
- The old fallback `collaboration.content_status ? 'review' : 'hired'` mapped any truthy status (including `'pending'` and `'in_progress'`) to `'review'`. Now all non-submitted, non-approved statuses map to `'hired'`, so the banner correctly shows the teal "active" state instead of the pink "action needed" state.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaignPhase.ts
git commit -m "fix: deriveCurrentStep maps pending/in_progress to hired step, not review"
```

---

### Task 2b: Update Banner UX for Active Delivery + Fix Overflow

**Files:**
- Modify: `src/components/campaigns/detail/CampaignStatusBanner.tsx:169-208, 232-241`

- [ ] **Step 1: Update the `active` state headline and subtext**

In `renderHeadline()` (around line 179), change the `active` case:

```typescript
// OLD:
case 'active': return 'Campaign In Progress';
```

To:

```typescript
case 'active':
  return phase === 'active_delivery' && creatorName
    ? `${creatorName} is working on your content`
    : 'Campaign In Progress';
```

In `renderSubtext()` (around lines 197-204), change the `active` case:

```typescript
// OLD:
case 'active': {
  if (currentStep) {
    const idx = getStepIndex(currentStep);
    const stepInfo = PROJECT_STEPS[idx];
    return `Step ${idx + 1} of ${PROJECT_STEPS.length} — ${stepInfo.label}`;
  }
  return 'Campaign is in active delivery.';
}
```

To:

```typescript
case 'active': {
  if (phase === 'active_delivery') {
    return 'You\'ll be notified when content is ready for review.';
  }
  if (currentStep) {
    const idx = getStepIndex(currentStep);
    const stepInfo = PROJECT_STEPS[idx];
    return `Step ${idx + 1} of ${PROJECT_STEPS.length} — ${stepInfo.label}`;
  }
  return 'Campaign is in active delivery.';
}
```

- [ ] **Step 2: Fix button overflow in `action_needed` state**

In `renderCtas()`, find the `action_needed` case (around line 234):

```tsx
// OLD:
<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
```

Replace with:

```tsx
<div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full lg:w-auto">
```

The addition of `flex-wrap` allows buttons to wrap to a new row on narrow desktop viewports instead of overflowing.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/detail/CampaignStatusBanner.tsx
git commit -m "fix: active delivery banner shows creator-is-working UX + fix button overflow"
```

---

## Task 3: Fix Landing Page

### Task 3a: Add Auth Loading Guard + Remove PortfolioStrip

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Delete: `src/components/landing/PortfolioStrip.tsx`

- [ ] **Step 1: Update LandingPage.tsx**

Replace the entire file content:

```tsx
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
const BriefGeneratorPreview = lazy(() => import("@/components/landing/BriefGeneratorPreview").then(m => ({ default: m.BriefGeneratorPreview })));
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BrandSection } from "@/components/landing/BrandSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  // Only show splash if auth is still loading AND there's evidence of a prior session
  // (avoids showing splash to first-time unauthenticated visitors)
  const hasSessionHint = typeof document !== 'undefined' &&
    document.cookie.includes('sb-') ;
  if (loading && hasSessionHint) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <img src="/lovable-uploads/dc-dragon-logo.png" alt="DragonCandy" className="h-16 w-auto mb-6" />
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative overflow-x-hidden">
      <SEO
        title="DragonCandy - AI-Powered Marketplace for Brands & Creators"
        description="DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI."
        path="/landing"
      />
      <div className="relative z-10 max-w-md md:max-w-2xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-8 lg:px-12">
        <Header />

        <section className="py-6 md:py-10 lg:py-12">
          <HeroSection />
          <Suspense fallback={null}><BriefGeneratorPreview /></Suspense>
          <HowItWorks />
          <FeatureSection />
          <BrandSection />
          <BottomCTA />
        </section>
      </div>
    </div>
  );
}
```

Key changes:
- Added `Spinner` import
- Added `if (loading)` guard before the main return that shows logo + spinner
- Removed `PortfolioStrip` import and render
- Removed the `<Suspense fallback={null}><PortfolioStrip /></Suspense>` block at the bottom

- [ ] **Step 2: Verify the logo path exists**

Run: `ls public/lovable-uploads/dc-dragon-logo.png` (or check what logo asset exists in the project). If the path is different, update the `<img src>` accordingly. Common alternatives: check `src/assets/` or other image paths in the project.

- [ ] **Step 3: Delete PortfolioStrip component and its orphaned hook**

Delete both files — confirmed only imported by each other and LandingPage.tsx which no longer uses them:
- `src/components/landing/PortfolioStrip.tsx`
- `src/hooks/useCreatorPortfolioFeed.ts`

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPage.tsx
git rm src/components/landing/PortfolioStrip.tsx src/hooks/useCreatorPortfolioFeed.ts
git commit -m "fix: add auth loading guard to prevent landing page flash + remove unused PortfolioStrip"
```

---

## Task 4: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build with no errors or warnings related to changed files.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`

Manual verification checklist:
1. **Skill filter**: Go to Browse Creators → click "Video Editing" pill → only creators with video_editing skill appear. Click multiple pills → filters combine correctly. Click "All" → shows all creators.
2. **Campaign status**: View a campaign where a creator was hired but hasn't submitted content → banner shows teal "Working on your content" (not pink "Ready for Review"). View a campaign where content was submitted → pink "Content Ready for Your Review" banner appears.
3. **Desktop overflow**: On desktop viewport, "Review & Approve" and "Request Revision" buttons stay within the banner bounds.
4. **Landing page flash**: Log in → refresh browser on dashboard → no landing page flash (logo + spinner shows briefly, then dashboard loads). Log out → visit `/` → landing page loads normally.
5. **PortfolioStrip**: Landing page ends with BottomCTA. No scrollable content strip at the bottom.
