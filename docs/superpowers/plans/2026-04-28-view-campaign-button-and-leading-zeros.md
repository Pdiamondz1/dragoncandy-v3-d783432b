# View Campaign Button & Leading Zeros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs — make the "View Campaign" button respond to taps on mobile, and eliminate leading zeros from all numeric input fields across the app.

**Architecture:** Bug 1 swaps mouse/touch event handlers on the swipe card button with pointer event handlers that fire before `react-tinder-card`'s drag detection. Bug 2 switches numeric inputs from `type="number"` to `type="text"` with `inputMode="numeric"`, using a shared sanitizer to strip leading zeros and non-digit characters. A small utility function is extracted to avoid duplicating the same regex across four files (per project code review standard: "Logic duplicated more than twice → extract to utility").

**Tech Stack:** React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-28-view-campaign-button-and-leading-zeros.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/inputUtils.ts` | `sanitizeNumericInput` helper — strips non-digits and leading zeros |
| Modify | `src/components/campaigns/CampaignSwipeCard.tsx:294-309` | Replace button event handlers with pointer events |
| Modify | `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx:82-139,248-254` | Fix 5 numeric inputs |
| Modify | `src/components/campaign-creator/CampaignEditor.tsx:88-89,97-98,102-103,134-135,169` | Fix 5 numeric inputs (incl. brand-only budget_pool) |
| Modify | `src/components/campaign-creator/BudgetSlider.tsx:17,22` | Fix 2 numeric inputs |
| Modify | `src/components/campaigns/CampaignBudgetTimelineForm.tsx:29-46` | Fix 2 numeric inputs (string-based) |

---

### Task 1: Create numeric input sanitizer utility

**Files:**
- Create: `src/lib/inputUtils.ts`

- [ ] **Step 1: Create the utility file**

```ts
// src/lib/inputUtils.ts

export function sanitizeNumericInput(raw: string): string {
  return raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
}
```

This strips non-digit characters, then removes leading zeros (preserving a lone "0").

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/inputUtils.ts
git commit -m "feat: add sanitizeNumericInput utility for leading-zero fix"
```

---

### Task 2: Fix View Campaign button with pointer events

**Files:**
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx:294-309`

- [ ] **Step 1: Replace button event handlers**

Find the current button (lines 294-309):
```tsx
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onViewDetail(campaign);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(campaign);
            }}
            className="w-full bg-dc-teal text-white rounded-full h-11 font-bold hover:bg-dc-teal-dark transition-colors duration-150 active:scale-95 text-sm relative z-10"
          >
            View Campaign
          </button>
```

Replace with:
```tsx
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onViewDetail(campaign);
            }}
            className="w-full bg-dc-teal text-white rounded-full h-11 font-bold hover:bg-dc-teal-dark transition-colors duration-150 active:scale-95 text-sm relative z-10"
          >
            View Campaign
          </button>
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignSwipeCard.tsx
git commit -m "fix: View Campaign button — switch to pointer events to bypass TinderCard drag capture"
```

---

### Task 3: Fix numeric inputs in BrandCampaignDetailsStep

**Files:**
- Modify: `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx`

- [ ] **Step 1: Add import**

Add at the top of the file with other imports:
```ts
import { sanitizeNumericInput } from '@/lib/inputUtils';
```

- [ ] **Step 2: Fix budgetMin input (line 82-89)**

Find:
```tsx
                <Input
                  type="number"
                  placeholder="Min"
                  min={0}
                  value={detailsData.budgetMin || ''}
                  onChange={(e) =>
                    updateField('budgetMin', Number(e.target.value))
                  }
                />
```

Replace with:
```tsx
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Min"
                  value={detailsData.budgetMin || ''}
                  onChange={(e) => {
                    const clean = sanitizeNumericInput(e.target.value);
                    updateField('budgetMin', Number(clean) || 0);
                  }}
                />
```

- [ ] **Step 3: Fix budgetMax input (line 93-100)**

Find:
```tsx
                <Input
                  type="number"
                  placeholder="Max"
                  min={0}
                  value={detailsData.budgetMax || ''}
                  onChange={(e) =>
                    updateField('budgetMax', Number(e.target.value))
                  }
                />
```

Replace with:
```tsx
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Max"
                  value={detailsData.budgetMax || ''}
                  onChange={(e) => {
                    const clean = sanitizeNumericInput(e.target.value);
                    updateField('budgetMax', Number(clean) || 0);
                  }}
                />
```

- [ ] **Step 4: Fix perCreatorCap input (line 113-122)**

Find:
```tsx
              <Input
                type="number"
                className="pl-7"
                placeholder="0"
                min={0}
                value={detailsData.perCreatorCap || ''}
                onChange={(e) =>
                  updateField('perCreatorCap', Number(e.target.value))
                }
              />
```

Replace with:
```tsx
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="pl-7"
                placeholder="0"
                value={detailsData.perCreatorCap || ''}
                onChange={(e) => {
                  const clean = sanitizeNumericInput(e.target.value);
                  updateField('perCreatorCap', Number(clean) || 0);
                }}
              />
```

- [ ] **Step 5: Fix creatorCount input (line 131-138)**

Find:
```tsx
            <Input
              type="number"
              placeholder="1"
              min={1}
              value={detailsData.creatorCount || ''}
              onChange={(e) =>
                updateField('creatorCount', Number(e.target.value))
              }
            />
```

Replace with:
```tsx
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="1"
              value={detailsData.creatorCount || ''}
              onChange={(e) => {
                const clean = sanitizeNumericInput(e.target.value);
                updateField('creatorCount', Number(clean) || 0);
              }}
            />
```

- [ ] **Step 6: Fix exclusivityDays input (line 248-254)**

Find:
```tsx
            <Input
              type="number"
              placeholder="e.g. 30"
              min={0}
              value={detailsData.exclusivityDays || ''}
              onChange={(e) =>
                updateField('exclusivityDays', Number(e.target.value))
              }
            />
```

Replace with:
```tsx
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 30"
              value={detailsData.exclusivityDays || ''}
              onChange={(e) => {
                const clean = sanitizeNumericInput(e.target.value);
                updateField('exclusivityDays', Number(clean) || 0);
              }}
            />
```

- [ ] **Step 7: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/components/brand-campaigns/BrandCampaignDetailsStep.tsx
git commit -m "fix: strip leading zeros from BrandCampaignDetailsStep numeric inputs"
```

---

### Task 4: Fix numeric inputs in CampaignEditor

**Files:**
- Modify: `src/components/campaign-creator/CampaignEditor.tsx`

- [ ] **Step 1: Add import**

Add at the top of the file with other imports:
```ts
import { sanitizeNumericInput } from '@/lib/inputUtils';
```

- [ ] **Step 2: Fix per_creator_cap input (line 88-89)**

Find:
```tsx
              <Input type="number" value={campaign.per_creator_cap || ''}
                onChange={(e) => updateField('per_creator_cap', Number(e.target.value))} className="text-sm" />
```

Replace with:
```tsx
              <Input type="text" inputMode="numeric" pattern="[0-9]*" value={campaign.per_creator_cap || ''}
                onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateField('per_creator_cap', Number(clean) || 0); }} className="text-sm" />
```

- [ ] **Step 3: Fix usage_rights_days input (line 97-98)**

Find:
```tsx
            <Input type="number" value={campaign.usage_rights_days || ''}
              onChange={(e) => updateField('usage_rights_days', Number(e.target.value))} className="mt-1 text-sm" />
```

Replace with:
```tsx
            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={campaign.usage_rights_days || ''}
              onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateField('usage_rights_days', Number(clean) || 0); }} className="mt-1 text-sm" />
```

- [ ] **Step 4: Fix exclusivity_days input (line 102-103)**

Find:
```tsx
            <Input type="number" value={campaign.exclusivity_days || ''}
              onChange={(e) => updateField('exclusivity_days', Number(e.target.value))} className="mt-1 text-sm" />
```

Replace with:
```tsx
            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={campaign.exclusivity_days || ''}
              onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateField('exclusivity_days', Number(clean) || 0); }} className="mt-1 text-sm" />
```

- [ ] **Step 5: Fix target_creator_count input (line 134-135)**

Find:
```tsx
          <Input type="number" min={1} value={campaign.target_creator_count || ''}
            onChange={(e) => updateField('target_creator_count', Number(e.target.value))} className="mt-1 text-sm w-24" />
```

Replace with:
```tsx
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={campaign.target_creator_count || ''}
            onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateField('target_creator_count', Number(clean) || 0); }} className="mt-1 text-sm w-24" />
```

- [ ] **Step 6: Fix budget_pool input (line 169, brand-only section)**

Find:
```tsx
                <Input type="number" value={brandFields.budget_pool || ''}
                  onChange={(e) => updateBrandField('budget_pool', Number(e.target.value))} className="text-sm" />
```

Replace with:
```tsx
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={brandFields.budget_pool || ''}
                  onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateBrandField('budget_pool', Number(clean) || 0); }} className="text-sm" />
```

- [ ] **Step 7: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/components/campaign-creator/CampaignEditor.tsx
git commit -m "fix: strip leading zeros from CampaignEditor numeric inputs"
```

---

### Task 5: Fix numeric inputs in BudgetSlider

**Files:**
- Modify: `src/components/campaign-creator/BudgetSlider.tsx`

- [ ] **Step 1: Add import**

Add at the top of the file:
```ts
import { sanitizeNumericInput } from '@/lib/inputUtils';
```

- [ ] **Step 2: Fix min input (line 17)**

Find:
```tsx
          <Input type="number" value={min || ''} onChange={(e) => onChangeMin(Number(e.target.value))} className="w-24 text-sm" />
```

Replace with:
```tsx
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={min || ''} onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); onChangeMin(Number(clean) || 0); }} className="w-24 text-sm" />
```

- [ ] **Step 3: Fix max input (line 22)**

Find:
```tsx
          <Input type="number" value={max || ''} onChange={(e) => onChangeMax(Number(e.target.value))} className="w-24 text-sm" />
```

Replace with:
```tsx
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={max || ''} onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); onChangeMax(Number(clean) || 0); }} className="w-24 text-sm" />
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/campaign-creator/BudgetSlider.tsx
git commit -m "fix: strip leading zeros from BudgetSlider numeric inputs"
```

---

### Task 6: Fix numeric inputs in CampaignBudgetTimelineForm

**Files:**
- Modify: `src/components/campaigns/CampaignBudgetTimelineForm.tsx`

**Note:** This component stores values as strings and passes strings to the parent via `onInputChange`. Sanitize the string before passing — do NOT convert to `Number()`.

- [ ] **Step 1: Add import**

Add at the top of the file with other imports:
```ts
import { sanitizeNumericInput } from '@/lib/inputUtils';
```

- [ ] **Step 2: Fix budget_min input (lines 29-36)**

Find:
```tsx
            <Input
              id="budget_min"
              name="budget_min"
              type="number"
              value={formData.budget_min}
              onChange={(e) => onInputChange('budget_min', e.target.value)}
              placeholder="0"
            />
```

Replace with:
```tsx
            <Input
              id="budget_min"
              name="budget_min"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.budget_min}
              onChange={(e) => onInputChange('budget_min', sanitizeNumericInput(e.target.value))}
              placeholder="0"
            />
```

- [ ] **Step 3: Fix budget_max input (lines 39-46)**

Find:
```tsx
            <Input
              id="budget_max"
              name="budget_max"
              type="number"
              value={formData.budget_max}
              onChange={(e) => onInputChange('budget_max', e.target.value)}
              placeholder="0"
            />
```

Replace with:
```tsx
            <Input
              id="budget_max"
              name="budget_max"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.budget_max}
              onChange={(e) => onInputChange('budget_max', sanitizeNumericInput(e.target.value))}
              placeholder="0"
            />
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignBudgetTimelineForm.tsx
git commit -m "fix: strip leading zeros from CampaignBudgetTimelineForm numeric inputs"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test View Campaign button**

Open the creator Available Campaigns view. Tap/click the "View Campaign" button on a campaign card. Verify:
- Button tap opens the campaign detail modal
- Swiping right still opens campaign detail
- Swiping left still skips the campaign
- Tapping the card body (outside the button) still opens detail view

- [ ] **Step 3: Test numeric inputs — campaign creation flow**

Navigate to the campaign creation wizard (Brand Campaign Details step). For each numeric field (Budget Min, Budget Max, Per-Creator Cap, Creator Count, Exclusivity):
- Clear the field completely → verify placeholder appears
- Type "00500" → verify it displays "500"
- Paste "0250" → verify it displays "250"
- Type "0" → verify field shows empty (placeholder), state is 0
- Type non-numeric characters → verify they are silently stripped

- [ ] **Step 4: Test numeric inputs — campaign editor**

Open an existing campaign in the editor. Test the same scenarios on Per-Creator Cap, Usage Rights, Exclusivity, and Target Creator Count fields.

- [ ] **Step 5: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix: final adjustments from manual verification"
```
