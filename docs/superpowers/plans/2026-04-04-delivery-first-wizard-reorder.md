# Delivery-First Campaign Wizard Reorder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the business campaign wizard so delivery tier is Step 0, add a new Visuals & Footage step, rebrand delivery types, and gate deliverables by tier.

**Architecture:** Reorder-in-place approach — keep existing `useCampaignWizard` hook and add `deliveryTier` state. Two new components (`DeliveryTierStep`, `CampaignVisualsStep`), rebrand existing delivery components, update step indices from 3 to 5.

**Tech Stack:** React, TypeScript, Tailwind CSS, react-hook-form, zod, sonner (toasts), lucide-react icons, react-dropzone (already in project via MediaUploader)

**Spec:** `docs/superpowers/specs/2026-04-04-delivery-first-wizard-reorder-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/campaignMedia.ts` | Modify | Add `DeliveryTier` type, `TIER_LIMITS` constant |
| `src/components/campaigns/DeliveryTypeSelector.tsx` | Modify | Rename type export to `DeliveryTier`, update values/labels/timeframes |
| `src/components/campaigns/DeliveryBadge.tsx` | Modify | Update config to new tier names/timeframes |
| `src/components/campaigns/DeliveryTierStep.tsx` | Create | New Step 0 — three tappable tier cards |
| `src/components/campaigns/CampaignVisualsStep.tsx` | Create | New Step 3 — visual refs, footage toggle, deliverable builder |
| `src/hooks/useCampaignWizard.ts` | Modify | Rename types, update step flow, add tier-change gating |
| `src/components/campaigns/DeliverableBuilder.tsx` | Modify | Accept `maxDeliverables` prop, use tier limits |
| `src/components/campaigns/CampaignTimelineBudgetStep.tsx` | Modify | Remove DeliveryTypeSelector usage, accept tier from parent |
| `src/components/campaigns/CampaignCustomizeForm.tsx` | Modify | Remove DeliverableBuilder, update button text |
| `src/components/campaigns/CampaignWizardHeader.tsx` | Modify | No code change needed (already data-driven from steps array) |
| `src/pages/CampaignWizard.tsx` | Modify | 5-step layout, wire new components |
| `src/components/campaigns/CampaignFinalizeStep.tsx` | Modify | Update type imports, update delivery timeframe strings |

---

## Task 1: Add DeliveryTier type and TIER_LIMITS constant

**Files:**
- Modify: `src/types/campaignMedia.ts`

- [ ] **Step 1: Add DeliveryTier type and TIER_LIMITS to campaignMedia.ts**

At the top of `src/types/campaignMedia.ts`, after the existing type exports (line 9), add:

```typescript
export type DeliveryTier = 'dragondash' | 'express' | 'standard';

export const TIER_LIMITS = {
  dragondash: {
    maxDeliverables: 2,
    contentTypes: ['photo', 'video_reel'] as ContentType[],
    timeframe: '1–3 hours',
    label: 'DragonDash',
    fee: 75,
    estimatedCreationTime: '~90 min',
  },
  express: {
    maxDeliverables: 4,
    contentTypes: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'] as ContentType[],
    timeframe: '24–48 hours',
    label: 'Express',
    fee: 25,
    estimatedCreationTime: '~1–2 days',
  },
  standard: {
    maxDeliverables: 10,
    contentTypes: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'] as ContentType[],
    timeframe: '5–7 days',
    label: 'Standard',
    fee: 0,
    estimatedCreationTime: '~4–5 days',
  },
} as const;
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: No type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/types/campaignMedia.ts
git commit -m "feat: add DeliveryTier type and TIER_LIMITS constant"
```

---

## Task 2: Rebrand DeliveryTypeSelector and DeliveryBadge

**Files:**
- Modify: `src/components/campaigns/DeliveryTypeSelector.tsx`
- Modify: `src/components/campaigns/DeliveryBadge.tsx`

- [ ] **Step 1: Update DeliveryTypeSelector.tsx**

Replace the `DeliveryType` type alias and `deliveryOptions` array. Change:

```typescript
export type DeliveryType = 'standard' | 'expedited' | 'dragonrush';
```

to:

```typescript
// Re-export from canonical location for backward compatibility
export type { DeliveryTier as DeliveryType } from '@/types/campaignMedia';
import type { DeliveryTier } from '@/types/campaignMedia';
```

Update the `deliveryOptions` array — rename types, labels, timeframes, fees:

| Old type | New type | New label | New timeframe | New description | New fee |
|----------|----------|-----------|---------------|-----------------|---------|
| `standard` | `standard` | Standard Delivery | 5–7 days | Best for full production campaigns with flexible timelines | No extra fee / $0 |
| `expedited` | `express` | Express Delivery | 24–48 hours | Quick turnaround for time-sensitive content | + $25 rush fee / $25 |
| `dragonrush` | `dragondash` | DragonDash Delivery | 1–3 hours | Ultra-fast delivery for urgent needs. Fixed price only. | + $75 premium fee / $75 |

Update the `DeliveryTypeSelectorProps` interface to use `DeliveryTier` internally but keep the same prop names for compatibility.

Update the icon colors: `dragonrush` → `dragondash` in the className conditionals (lines 98-101).

Update the badge check: `option.type === 'dragonrush'` → `option.type === 'dragondash'` (line 90).

- [ ] **Step 2: Update DeliveryBadge.tsx**

Change the import to use `DeliveryTier`:

```typescript
import type { DeliveryTier } from '@/types/campaignMedia';
// Keep backward-compatible type alias
type DeliveryType = DeliveryTier;
```

Update `deliveryConfig` keys and values:

```typescript
const deliveryConfig: Record<DeliveryTier, { icon: any; label: string; timeframe: string; bgClass: string; iconClass: string }> = {
  standard: {
    icon: Turtle,
    label: 'Standard',
    timeframe: '5–7 days',
    bgClass: 'bg-green-100 text-green-700 border-green-200',
    iconClass: 'text-green-600',
  },
  express: {
    icon: Zap,
    label: 'Express',
    timeframe: '24–48 hrs',
    bgClass: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    iconClass: 'text-yellow-600',
  },
  dragondash: {
    icon: Flame,
    label: 'DragonDash',
    timeframe: '1–3 hrs',
    bgClass: 'bg-gradient-to-r from-orange-100 to-pink-100 text-orange-700 border-orange-200',
    iconClass: 'text-orange-600',
  },
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: Build succeeds. Any import errors from other files using `DeliveryType` should resolve via the re-export.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/DeliveryTypeSelector.tsx src/components/campaigns/DeliveryBadge.tsx
git commit -m "feat: rebrand delivery types to DragonDash/Express/Standard"
```

---

## Task 3: Create DeliveryTierStep component

**Files:**
- Create: `src/components/campaigns/DeliveryTierStep.tsx`

- [ ] **Step 1: Create DeliveryTierStep.tsx**

This is the new Step 0. Three tappable cards in a single-column mobile layout. Props:

```typescript
interface DeliveryTierStepProps {
  selectedTier: DeliveryTier | null;
  onSelect: (tier: DeliveryTier) => void;
  onContinue: () => void;
}
```

Component structure:
- Page heading: "How fast do you need it?" (bold, dark)
- Subtext: "Choose your delivery speed — this determines scope and pricing"
- Three cards using Tailwind (no Card component — custom styled divs to match mockup):
  - Each card: `rounded-2xl border-2 p-5 cursor-pointer transition-all` 
  - Selected state: `border-dc-teal bg-dc-teal/5 ring-2 ring-dc-teal/20` + checkmark icon (CheckCircle2 from lucide)
  - Unselected state: `border-gray-200 bg-white hover:border-dc-teal/50`
  - DragonDash card gets a "PREMIUM" badge (absolute positioned, teal gradient bg, white text, `rounded-full`)
  - Each card layout: flex row with icon circle (left) and text content (right)
  - Icon circles: 48px, rounded-xl, gradient backgrounds per tier
  - Text: tier name (font-extrabold text-lg), timeframe (text-sm, tier-colored), description (text-xs text-gray-500), price badge + "Max N deliverables" (text-xs text-gray-400)
- "Continue" button at bottom: `w-full rounded-full bg-dc-teal text-white font-semibold py-3`, disabled when `selectedTier === null`

Use `TIER_LIMITS` from `@/types/campaignMedia` for the tier data to stay DRY.

Icons per tier: ⚡ (DragonDash), 🚀 (Express), 📅 (Standard) — use emoji in spans, not lucide icons, to match the mockup.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: Component compiles (not yet wired into wizard).

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/DeliveryTierStep.tsx
git commit -m "feat: create DeliveryTierStep component for wizard Step 0"
```

---

## Task 4: Create CampaignVisualsStep component

**Files:**
- Create: `src/components/campaigns/CampaignVisualsStep.tsx`

- [ ] **Step 1: Create CampaignVisualsStep.tsx**

Props:

```typescript
import type { DeliveryTier, StagedFile, Deliverable } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';

interface CampaignVisualsStepProps {
  deliveryTier: DeliveryTier;
  referenceMedia: StagedFile[];
  onReferenceMediaChange: (files: StagedFile[]) => void;
  rawFootage: StagedFile[];
  onRawFootageChange: (files: StagedFile[]) => void;
  deliverables: Deliverable[];
  onDeliverablesChange: (deliverables: Deliverable[]) => void;
  onContinue: () => void;
  onBack: () => void;
}
```

Three sections in white rounded cards (`bg-white rounded-2xl p-5`):

**Section A — Visual References:**
- Reuse existing `MediaUploader` component with `mediaType="reference_image"` and `maxFiles={5}`
- Header: "Show creators what you're looking for" (font-extrabold text-base)
- Subtext: "Upload example images or short reels that match your vision"

**Section B — Raw Footage Toggle:**
- `useState<boolean>(false)` for toggle state (default OFF if rawFootage is empty, ON if rawFootage has files)
- Toggle UI: a flex row with label text and a Switch component (from shadcn/ui `@/components/ui/switch` — check if it exists, otherwise use a custom toggle button)
- When ON: show `MediaUploader` with `mediaType="raw_footage"` and `maxFiles={10}`
- When OFF: hidden

**Section C — Deliverable Builder:**
- Import and render `DeliverableBuilder` component
- Pass `maxDeliverables={TIER_LIMITS[deliveryTier].maxDeliverables}` (Task 5 adds this prop)
- Pass `allowedContentTypes={TIER_LIMITS[deliveryTier].contentTypes}`

Navigation buttons at bottom: "Back" (outline) and "Continue to Review" (teal pill).

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: May have errors related to DeliverableBuilder props not yet updated — that's OK, will fix in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignVisualsStep.tsx
git commit -m "feat: create CampaignVisualsStep component for wizard Step 3"
```

---

## Task 5: Update DeliverableBuilder to accept tier limits

**Files:**
- Modify: `src/components/campaigns/DeliverableBuilder.tsx`

- [ ] **Step 1: Add maxDeliverables and allowedContentTypes props**

Update the interface at line 17-19:

```typescript
interface DeliverableBuilderProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
  maxDeliverables?: number;          // NEW — defaults to 10
  allowedContentTypes?: ContentType[]; // NEW — defaults to all
}
```

Add import for `ContentType` from `@/types/campaignMedia`.

Update the component signature to destructure new props with defaults:

```typescript
export default function DeliverableBuilder({
  deliverables,
  onChange,
  maxDeliverables = 10,
  allowedContentTypes,
}: DeliverableBuilderProps) {
```

- [ ] **Step 2: Replace hardcoded MAX_DELIVERABLES**

Change line 54 from `const MAX_DELIVERABLES = 10;` — remove this constant.

Update `addDeliverable` (line 71): change `MAX_DELIVERABLES` to `maxDeliverables`.

Update the disabled check on the Add button (line 236): change `MAX_DELIVERABLES` to `maxDeliverables`.

Update the button text (line 238): change `MAX_DELIVERABLES` to `maxDeliverables`.

- [ ] **Step 3: Filter CONTENT_TYPE_OPTIONS by allowedContentTypes**

In the content type `<Select>` (around line 132), filter the options:

```typescript
const filteredContentTypes = allowedContentTypes
  ? CONTENT_TYPE_OPTIONS.filter(opt => allowedContentTypes.includes(opt.value))
  : CONTENT_TYPE_OPTIONS;
```

Use `filteredContentTypes` instead of `CONTENT_TYPE_OPTIONS` in the Select's `SelectContent`.

- [ ] **Step 4: Add tier limit tooltip to Add button**

When `deliverables.length >= maxDeliverables`, the button text should show "Maximum deliverables reached" (already does). Optionally wrap in a `Tooltip` showing the tier name, but keeping existing behavior is fine.

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/DeliverableBuilder.tsx
git commit -m "feat: add tier-based limits to DeliverableBuilder"
```

---

## Task 6: Update useCampaignWizard hook

**Files:**
- Modify: `src/hooks/useCampaignWizard.ts`

- [ ] **Step 1: Update imports and types**

Replace import at line 7:
```typescript
import { DeliveryType } from '@/components/campaigns/DeliveryTypeSelector';
```
with:
```typescript
import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
```

In `TimelineBudgetData` (line 13), change:
```typescript
deliveryType: 'standard' | 'expedited' | 'dragonrush';
```
to:
```typescript
deliveryType: DeliveryTier;
```

In `FinalCampaignData` (line 31), change:
```typescript
deliveryType: 'standard' | 'expedited' | 'dragonrush';
```
to:
```typescript
deliveryType: DeliveryTier;
```

- [ ] **Step 2: Update state initialization**

Change line 57:
```typescript
const [deliveryTier, setDeliveryTier] = useState<DeliveryType>('standard');
```
to:
```typescript
const [deliveryTier, setDeliveryTier] = useState<DeliveryTier | null>(null);
```

Update `deliveryFee` to derive from tier:
```typescript
const [deliveryFee, setDeliveryFee] = useState(0);
```
(Keep as-is — fee is updated when tier changes.)

- [ ] **Step 3: Add tier change handler with deliverable gating**

Add a new handler after the existing `handleContinueFromDeliveryTier` (around line 164):

```typescript
const handleTierSelect = (tier: DeliveryTier) => {
  const prevTier = deliveryTier;
  setDeliveryTier(tier);
  setDeliveryFee(TIER_LIMITS[tier].fee);

  // Gate deliverables if switching to a lower-cap tier
  const maxDel = TIER_LIMITS[tier].maxDeliverables;
  if (deliverables.length > maxDel) {
    setDeliverables(deliverables.slice(0, maxDel));
    toast.info(`Reduced to ${maxDel} deliverables for ${TIER_LIMITS[tier].label}`);
  }

  // Filter out content types not allowed by new tier
  const allowedTypes = TIER_LIMITS[tier].contentTypes;
  const filtered = deliverables.map(d => {
    if (!allowedTypes.includes(d.content_type)) {
      return { ...d, content_type: allowedTypes[0] };
    }
    return d;
  });
  if (JSON.stringify(filtered) !== JSON.stringify(deliverables)) {
    setDeliverables(filtered.slice(0, maxDel));
  }
};
```

- [ ] **Step 4: Update step navigation**

`handleGenerateWithAI` at line 105: change `setCurrentStep(1)` to `setCurrentStep(2)` (Brief is now Step 1, Details is Step 2).

`handleContinueFromTimelineBudget` at line 226: change `setCurrentStep(2)` to `setCurrentStep(4)` (Review is now Step 4).

`handleBack` at line 238: keep as-is (decrements by 1).

- [ ] **Step 5: Export new handler and updated state**

Add `handleTierSelect` and `setDeliveryTier` to the return object. Ensure `deliveryTier` can be `null` (for the "no selection" initial state).

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: May have errors in CampaignWizard.tsx (step indices don't match yet) — that's OK, fixed in Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCampaignWizard.ts
git commit -m "feat: update wizard hook for 5-step flow with tier gating"
```

---

## Task 7: Update CampaignTimelineBudgetStep and CampaignCustomizeForm

**Files:**
- Modify: `src/components/campaigns/CampaignTimelineBudgetStep.tsx`
- Modify: `src/components/campaigns/CampaignCustomizeForm.tsx`

- [ ] **Step 1: Remove DeliveryTypeSelector from CampaignTimelineBudgetStep**

In `CampaignTimelineBudgetStep.tsx`:

1. Remove the import of `DeliveryTypeSelector` and `deliveryOptions` (line 14)
2. Import `DeliveryTier` from `@/types/campaignMedia` instead
3. Update the zod schema `deliveryType` enum (line 23): change `['standard', 'expedited', 'dragonrush']` to `['dragondash', 'express', 'standard']`
4. Remove the `deliveryType` and `deliveryFee` local state (lines 76-81) — these now come from props
5. Remove the `useEffect` that forces fixed pricing for dragonrush (lines 96-99) — update to check for `dragondash`
6. Remove `handleDeliveryTypeChange` function (lines 103-107)
7. Remove the Delivery Type Selection `<Card>` block (lines 152-159)
8. The props should now accept `deliveryTier` and `deliveryFee` directly instead of reading from `initialData.delivery_type`:

```typescript
interface CampaignTimelineBudgetStepProps {
  deliveryTier: DeliveryTier;
  deliveryFee: number;
  initialData?: {
    goals?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    pricing_type?: PricingType;
    fixed_price?: number;
  };
  onContinue: (data: TimelineBudgetFormData) => void;
  onBackToCustomize: () => void;
}
```

9. Update `forceFixed` check (line 175): change `deliveryType === 'dragonrush'` to `deliveryTier === 'dragondash'`
10. Update `getAiRecommendedPrice` (lines 139-144): change `dragonrush` to `dragondash`, `expedited` to `express`

- [ ] **Step 2: Remove DeliverableBuilder from CampaignCustomizeForm**

In `CampaignCustomizeForm.tsx`: No changes needed — `DeliverableBuilder` is actually rendered in `CampaignWizard.tsx` (line 104), not in `CampaignCustomizeForm`. The form just has basic fields + platform + content type selectors.

Update the submit button text (line 79): change "Continue to Timeline & Budget" to "Continue" (since the next step is now the Visuals step, not directly Timeline & Budget).

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignTimelineBudgetStep.tsx src/components/campaigns/CampaignCustomizeForm.tsx
git commit -m "feat: remove delivery selector from timeline step, update form flow"
```

---

## Task 8: Wire everything together in CampaignWizard.tsx

**Files:**
- Modify: `src/pages/CampaignWizard.tsx`

- [ ] **Step 1: Update imports**

Add imports for new components:

```typescript
import DeliveryTierStep from '@/components/campaigns/DeliveryTierStep';
import CampaignVisualsStep from '@/components/campaigns/CampaignVisualsStep';
```

Remove the `DeliverableBuilder` import (line 11) — it's now inside `CampaignVisualsStep`.

- [ ] **Step 2: Update steps array**

Replace the 3-step array (lines 41-45) with:

```typescript
const steps = [
  { number: 1, title: 'Speed', active: true },
  { number: 2, title: 'Brief', active: false },
  { number: 3, title: 'Details', active: false },
  { number: 4, title: 'Visuals', active: false },
  { number: 5, title: 'Review', active: false },
];
```

- [ ] **Step 3: Destructure new values from hook**

Add `handleTierSelect` and `setDeliveryTier` to the destructured return from `useCampaignWizard()`.

- [ ] **Step 4: Rewrite step rendering**

Replace the step content section (lines 71-133) with 5 steps:

```tsx
{/* Step 0: Delivery Tier */}
{currentStep === 0 && (
  <DeliveryTierStep
    selectedTier={deliveryTier}
    onSelect={handleTierSelect}
    onContinue={() => setCurrentStep(1)}
  />
)}

{/* Step 1: Brief */}
{currentStep === 1 && (
  <CampaignBriefStep
    campaignGoal={campaignGoal}
    setCampaignGoal={setCampaignGoal}
    contentSource={contentSource}
    setContentSource={setContentSource}
    referenceMedia={referenceMedia}
    setReferenceMedia={setReferenceMedia}
    rawFootage={rawFootage}
    setRawFootage={setRawFootage}
    onGenerateWithAI={handleGenerateWithAI}
    isGenerating={isGenerating}
    hasAnalysis={!!campaignAnalysis}
    onNext={() => {
      if (campaignAnalysis) {
        setCurrentStep(2);
      }
    }}
  />
)}

{/* Step 2: Details */}
{currentStep === 2 && campaignAnalysis && (
  <div className="space-y-6">
    <CampaignCustomizeForm
      initialData={campaignAnalysis}
      onContinue={(data) => {
        setCustomizedCampaign(data);
        setCurrentStep(3);
      }}
      onBackToAnalysis={() => setCurrentStep(1)}
    />

    <CampaignTimelineBudgetStep
      deliveryTier={deliveryTier!}
      deliveryFee={deliveryFee}
      initialData={{
        goals: Array.isArray(customizedCampaign?.goals)
          ? customizedCampaign.goals.join('. ')
          : customizedCampaign?.goals || '',
        deadline: undefined,
        budget_min: undefined,
        budget_max: undefined,
      }}
      onContinue={handleContinueFromTimelineBudget}
      onBackToCustomize={() => setCurrentStep(1)}
    />
  </div>
)}

{/* Step 3: Visuals & Footage */}
{currentStep === 3 && (
  <CampaignVisualsStep
    deliveryTier={deliveryTier!}
    referenceMedia={referenceMedia}
    onReferenceMediaChange={setReferenceMedia}
    rawFootage={rawFootage}
    onRawFootageChange={setRawFootage}
    deliverables={deliverables}
    onDeliverablesChange={setDeliverables}
    onContinue={() => {
      // Build final data and move to review
      handleContinueFromTimelineBudget(/* pass current timeline data */);
    }}
    onBack={() => setCurrentStep(2)}
  />
)}

{/* Step 4: Review & Launch */}
{currentStep === 4 && finalCampaignData && (
  <CampaignFinalizeStep
    campaignData={finalCampaignData}
    onBack={() => setCurrentStep(3)}
  />
)}
```

**Note:** The exact wiring of `handleContinueFromTimelineBudget` may need adjustment. The current flow has Timeline & Budget in Step 2 which builds `finalCampaignData` and moves to Step 4. The key is that after Step 2 submits the form, it should set `timelineBudgetData` and move to Step 3 (Visuals), then Step 3's continue moves to Step 4 (Review). Update `handleContinueFromTimelineBudget` in the hook to set data but go to Step 3 instead of jumping to Review:

In `useCampaignWizard.ts`, change the step in `handleContinueFromTimelineBudget` (line 226):
```typescript
setCurrentStep(3); // Go to Visuals step, not Review
```

Then add a new handler `handleContinueFromVisuals` that builds finalCampaignData and goes to Step 4:

```typescript
const handleContinueFromVisuals = () => {
  if (!timelineBudgetData) return;

  const finalData: FinalCampaignData = {
    title: customizedCampaign?.title || campaignAnalysis?.title || '',
    description: customizedCampaign?.description || campaignAnalysis?.description || '',
    goals: timelineBudgetData.goals,
    deliverables: customizedCampaign?.content_types || campaignAnalysis?.content_types || [],
    platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
    style: customizedCampaign?.style || '',
    tone: customizedCampaign?.tone || '',
    deadline: timelineBudgetData.deadline,
    deliveryType: deliveryTier!,
    deliveryFee: deliveryFee,
    pricingType: timelineBudgetData.pricingType,
    fixedPrice: timelineBudgetData.fixedPrice,
    budgetMin: timelineBudgetData.budgetMin,
    budgetMax: timelineBudgetData.budgetMax,
    aiAnalysis: campaignAnalysis || undefined,
    contentSource,
    structuredDeliverables: deliverables,
    draftCampaignId: draftCampaignId || undefined,
  };

  setFinalCampaignData(finalData);
  setCurrentStep(4);
};
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | head -40`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CampaignWizard.tsx src/hooks/useCampaignWizard.ts
git commit -m "feat: wire 5-step wizard flow in CampaignWizard page"
```

---

## Task 9: Update CampaignFinalizeStep for new tier names

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx`

- [ ] **Step 1: Update imports**

Replace `import type { DeliveryType } from './DeliveryTypeSelector';` (line 20) with:
```typescript
import type { DeliveryTier } from '@/types/campaignMedia';
```

Update the `campaignData` type in props (line 46) — change `deliveryType: DeliveryType` to `deliveryType: DeliveryTier`.

- [ ] **Step 2: Update getDeliveryTimeframe**

Change the function (lines 110-116):

```typescript
const getDeliveryTimeframe = () => {
  switch (campaignData.deliveryType) {
    case 'dragondash': return '1–3 hours';
    case 'express': return '24–48 hours';
    default: return '5–7 days';
  }
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "feat: update finalize step for new delivery tier names"
```

---

## Task 10: Final integration test and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 2: Search for stale references**

Search the codebase for any remaining references to old delivery type names:

```bash
grep -r "dragonrush\|expedited" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references.

- [ ] **Step 3: Search for stale DeliveryType imports**

```bash
grep -r "DeliveryType" src/ --include="*.ts" --include="*.tsx" -l
```

Ensure all files either import `DeliveryTier` directly or use the re-export from `DeliveryTypeSelector.tsx`. No file should define its own `DeliveryType` inline.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up stale delivery type references"
```

- [ ] **Step 5: Final commit with spec message**

If all previous commits are clean, create a squash-friendly summary commit or leave as-is per user preference.
