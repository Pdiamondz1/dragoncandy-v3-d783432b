

# Add Step 0: Delivery Tier Selection to Campaign Wizard

## Overview

Add a new "Step 0: Delivery Tier" as the first screen in the Campaign Wizard. This step allows users to choose their delivery speed before entering their campaign goal. All existing steps shift by +1 but their internal logic remains unchanged.

---

## Visual Design (Based on Reference)

The new step will display three delivery tier cards:

| Tier | Timeframe | Fee | Details |
|------|-----------|-----|---------|
| **Standard** | 72 hours | No extra fee | Best for non-urgent campaigns |
| **Expedited** | 8-12 hours | +$25 | Quick turnaround for time-sensitive content |
| **DragonRush** | 1-3 hours | +$75 | Ultra-fast delivery, fixed price only |

Each card will show:
- Icon (Turtle / Zap / Flame)
- Timeframe badge
- Fee indicator
- Timer rule: "Timer starts when creator taps Start Capture"

---

## Files to Modify

### 1. Create New Component: `src/components/campaigns/DeliveryTierStep.tsx`

New step component displaying the three delivery options:

```tsx
// Key features:
- Three selectable cards (Standard, Expedited, DragonRush)
- Visual indicators for pricing (+$X fee)
- "What's included" details for each tier
- Timer rules explanation
- "Continue" button to proceed to Step 1
```

### 2. Update Hook: `src/hooks/useCampaignWizard.ts`

**Changes:**
- Change initial `currentStep` from `1` to `0` (line 40)
- Add new state: `deliveryTier` for storing Step 0 selection
- Add handler: `handleContinueFromDeliveryTier`
- Add handler: `handleBackToDeliveryTier`
- Update `handleEditCampaignIdea` to go to step `1` (Campaign Goal)
- Update all step transitions to account for the new step 0:
  - Step 0 → Step 1 (Delivery → Campaign Goal)
  - Step 1 → Step 2 (Campaign Goal → AI Analysis)
  - etc.

### 3. Update Main Page: `src/pages/CampaignWizard.tsx`

**Changes:**
- Update `steps` array to include Step 0:
  ```tsx
  const steps = [
    { number: 0, title: 'Delivery Tier', active: true },
    { number: 1, title: 'Campaign Goal', active: false },
    { number: 2, title: 'AI Analysis', active: false },
    { number: 3, title: 'Customize', active: false },
    { number: 4, title: 'DragonDash', active: false },
    { number: 5, title: 'Finalize', active: false },
  ];
  ```
- Add conditional render for Step 0 showing `DeliveryTierStep`
- Import the new component

### 4. Update Header: `src/components/campaigns/CampaignWizardHeader.tsx`

**Changes:**
- Update styling to handle step 0 properly
- Ensure step numbers display correctly (0, 1, 2, 3, 4, 5)

---

## New Component Structure: DeliveryTierStep

```text
+------------------------------------------------+
|              Choose Your Delivery Speed         |
|   How fast do you need content delivered?       |
+------------------------------------------------+

+----------------+ +----------------+ +----------------+
|    STANDARD    | |   EXPEDITED    | |  DRAGONRUSH   |
|     (🐢)       | |      (⚡)       | |     (🔥)      |
|                | |                | |   [Premium]   |
|   72 hours     | |   8-12 hours   | |   1-3 hours   |
|                | |                | |               |
| No extra fee   | |  + $25 rush    | | + $75 premium |
|                | |                | |               |
| ✓ Standard     | | ✓ Priority     | | ✓ Top priority|
|   support      | |   matching     | | ✓ Dedicated   |
|                | | ✓ Faster       | |   support     |
|                | |   review       | | ✓ Guaranteed  |
+----------------+ +----------------+ +----------------+

   ⏱️ Timer starts when creator taps "Start Capture"

                           [ Continue → ]
```

---

## Data Flow

1. User lands on Step 0 → Selects delivery tier
2. Selection stored in `deliveryTier` state
3. User clicks "Continue" → Moves to Step 1 (Campaign Goal)
4. Delivery tier data flows through wizard to Step 4 (DragonDash)
5. At Step 4, the pre-selected delivery tier is used as default

---

## Technical Details

### State Addition in useCampaignWizard.ts

```typescript
// New state
const [deliveryTier, setDeliveryTier] = useState<DeliveryType>('standard');

// New handler
const handleContinueFromDeliveryTier = (tier: DeliveryType) => {
  setDeliveryTier(tier);
  setCurrentStep(1);
};

const handleBackToDeliveryTier = () => {
  setCurrentStep(0);
};
```

### Pass Pre-selected Tier to Step 4

When rendering `CampaignTimelineBudgetStep`, pass the pre-selected delivery tier:

```tsx
<CampaignTimelineBudgetStep
  initialData={{
    ...existingData,
    delivery_type: deliveryTier, // Pre-populate from Step 0
  }}
  ...
/>
```

---

## Summary of Changes

| File | Action |
|------|--------|
| `src/components/campaigns/DeliveryTierStep.tsx` | **CREATE** - New step 0 component |
| `src/hooks/useCampaignWizard.ts` | **MODIFY** - Add state, handlers, update step numbers |
| `src/pages/CampaignWizard.tsx` | **MODIFY** - Add Step 0 render, update steps array |
| `src/components/campaigns/CampaignWizardHeader.tsx` | **MODIFY** - Handle step 0 display |

---

## No Breaking Changes

- All existing wizard functionality remains intact
- Step 4 (DragonDash) still allows changing the delivery tier
- The pre-selection from Step 0 simply provides a better default
- Back navigation works correctly throughout the flow

