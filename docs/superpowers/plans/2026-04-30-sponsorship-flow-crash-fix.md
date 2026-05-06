# Sponsorship Flow Crash Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the P0 crash when viewing campaign details (style_direction object rendered as React child), plus two P2 sponsorship flow bugs.

**Architecture:** Extract a shared `StyleDirection` interface in `src/types/campaign.ts`, fix the hydration cast in `useCampaignQueries.ts`, then update all rendering sites (`ContentRequirementsSection`, `CampaignDetailModal`) and the edit form to handle the `string | StyleDirection` union. Separately, guard a navigation URL and fix a cache invalidation key.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-30-sponsorship-flow-crash-fix-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/campaign.ts` | Modify | Extract and export `StyleDirection` interface; update `CampaignAnalysis` to use it |
| `src/hooks/useCampaignQueries.ts` | Modify | Import `StyleDirection`, widen `Campaign.style_direction` to `string \| StyleDirection`, remove bad `as string` cast |
| `src/components/campaign-details/sections/ContentRequirementsSection.tsx` | Modify | Render object-type `style_direction` as labeled sub-fields |
| `src/components/campaigns/CampaignDetailModal.tsx` | Modify | Render object-type `style_direction` as condensed joined string |
| `src/hooks/useCampaignEditForm.ts` | Modify | Coerce object `style_direction` to readable string for textarea |
| `src/pages/BrandSponsorships.tsx` | Modify | Guard undefined campaign ID in "View Campaign" navigation |
| `src/hooks/useSponsorshipComplete.ts` | Modify | Add `sponsorship-proposals` to cache invalidation list |

---

### Task 1: Extract `StyleDirection` interface and fix types

**Files:**
- Modify: `src/types/campaign.ts:40-45`
- Modify: `src/hooks/useCampaignQueries.ts:5,28,69-70`

- [ ] **Step 1: Extract `StyleDirection` interface in `campaign.ts`**

In `src/types/campaign.ts`, add the interface before `CampaignAnalysis` and update the inline type to reference it:

```typescript
// Add before CampaignAnalysis (around line 15):
export interface StyleDirection {
  mood?: string;
  visual_style?: string;
  color_palette?: string;
  references?: string;
}
```

Then replace the inline anonymous type at lines 40-45:

```typescript
// Before:
  style_direction?: {
    visual_style: string;
    mood: string;
    color_palette: string;
    references: string;
  };

// After:
  style_direction?: StyleDirection;
```

- [ ] **Step 2: Update `Campaign` interface in `useCampaignQueries.ts`**

Add the import at the top of `src/hooks/useCampaignQueries.ts`:

```typescript
import type { CampaignAnalysis, StyleDirection } from '@/types/campaign';
```

Then update the `Campaign` interface `style_direction` field (around line 69):

```typescript
// Before:
  style_direction?: string;

// After:
  style_direction?: string | StyleDirection;
```

- [ ] **Step 3: Fix the hydration cast in `hydrateCampaignFromAnalysis`**

In `src/hooks/useCampaignQueries.ts`, update line 28:

```typescript
// Before:
    style_direction: campaign.style_direction || (ai.style_direction as string) || undefined,

// After:
    style_direction: campaign.style_direction || (ai.style_direction as StyleDirection) || undefined,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/types/campaign.ts src/hooks/useCampaignQueries.ts
git commit -m "fix: extract StyleDirection interface and fix hydration cast

The ai_analysis.style_direction field is always an object but was cast
as string, causing a React render crash on campaign detail pages.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix `ContentRequirementsSection` rendering

**Files:**
- Modify: `src/components/campaign-details/sections/ContentRequirementsSection.tsx:84-88`

- [ ] **Step 1: Update the import**

Add `StyleDirection` to the imports at the top of the file:

```typescript
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { StyleDirection } from '@/types/campaign';
```

- [ ] **Step 2: Replace the style_direction rendering block**

Replace lines 84-88:

```tsx
// Before:
        {campaign.style_direction && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Style Direction</span>
            <p className="text-sm text-gray-600 leading-relaxed mt-1">{campaign.style_direction}</p>
          </div>
        )}

// After:
        {campaign.style_direction && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Style Direction</span>
            {typeof campaign.style_direction === 'string' ? (
              <p className="text-sm text-gray-600 leading-relaxed mt-1">{campaign.style_direction}</p>
            ) : (
              <div className="mt-1 space-y-2">
                {campaign.style_direction.mood && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Mood</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.mood}</p>
                  </div>
                )}
                {campaign.style_direction.visual_style && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Visual Style</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.visual_style}</p>
                  </div>
                )}
                {campaign.style_direction.color_palette && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Color Palette</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.color_palette}</p>
                  </div>
                )}
                {campaign.style_direction.references && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">References</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.references}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-details/sections/ContentRequirementsSection.tsx
git commit -m "fix: render style_direction object as labeled sub-fields

When style_direction is an object from ai_analysis, render mood,
visual_style, color_palette, and references as separate labeled items.
Falls back to plain text for string values.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Fix `CampaignDetailModal` rendering

**Files:**
- Modify: `src/components/campaigns/CampaignDetailModal.tsx:249-252`

- [ ] **Step 1: Replace the style_direction rendering block**

Replace lines 249-252 in `CampaignDetailModal.tsx`:

```tsx
// Before:
              {/* Style direction */}
              {campaign.style_direction && (
                <p className="text-xs text-gray-500 italic">{campaign.style_direction}</p>
              )}

// After:
              {/* Style direction */}
              {campaign.style_direction && (
                <p className="text-xs text-gray-500 italic">
                  {typeof campaign.style_direction === 'string'
                    ? campaign.style_direction
                    : [campaign.style_direction.mood, campaign.style_direction.visual_style,
                       campaign.style_direction.color_palette, campaign.style_direction.references]
                      .filter(Boolean).join('. ')}
                </p>
              )}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignDetailModal.tsx
git commit -m "fix: safely render style_direction in campaign detail modal

Join object sub-fields into a condensed sentence for the modal's
compact layout instead of crashing on object render.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Fix edit form `[object Object]` display

**Files:**
- Modify: `src/hooks/useCampaignEditForm.ts:97`

- [ ] **Step 1: Add object-to-string coercion in the useEffect**

In `src/hooks/useCampaignEditForm.ts`, replace line 97:

```typescript
// Before:
        style_direction: campaign.style_direction || '',

// After:
        style_direction: typeof campaign.style_direction === 'string'
          ? campaign.style_direction
          : campaign.style_direction
            ? [campaign.style_direction.mood, campaign.style_direction.visual_style,
               campaign.style_direction.color_palette, campaign.style_direction.references]
              .filter(Boolean).join('. ')
            : '',
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignEditForm.ts
git commit -m "fix: coerce style_direction object to readable string in edit form

Flatten the object into joined sub-fields so the textarea displays
readable text instead of [object Object].

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Guard undefined campaign ID in brand navigation

**Files:**
- Modify: `src/pages/BrandSponsorships.tsx:325-330`

- [ ] **Step 1: Replace the View Campaign onClick handler**

In `src/pages/BrandSponsorships.tsx`, find the "View Campaign" button (around line 325) and replace the `onClick`:

```tsx
// Before:
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                      onClick={() => navigate(`/dashboard/brand/campaigns/${sponsorship.campaigns?.id}`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Campaign
                    </Button>

// After:
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                      onClick={() => {
                        if (sponsorship.campaigns?.id) {
                          navigate(`/dashboard/brand/campaigns/${sponsorship.campaigns.id}`);
                        } else {
                          toast({ title: "Campaign unavailable", description: "This campaign may have been removed.", variant: "destructive" });
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Campaign
                    </Button>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/BrandSponsorships.tsx
git commit -m "fix: guard undefined campaign ID in brand sponsorship navigation

Show toast instead of navigating to /undefined when campaign has been
deleted.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Fix cache invalidation after sponsorship completion

**Files:**
- Modify: `src/hooks/useSponsorshipComplete.ts:167-171`

- [ ] **Step 1: Add the missing query key invalidation**

In `src/hooks/useSponsorshipComplete.ts`, add the missing invalidation after line 171:

```typescript
// Existing lines 167-171:
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['business-sponsorships'] });
      queryClient.invalidateQueries({ queryKey: ['sponsorship-completion'] });

// Add this line after line 171:
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSponsorshipComplete.ts
git commit -m "fix: invalidate sponsorship-proposals cache after completion

The restaurant-side BusinessSponsorships page uses the
sponsorship-proposals query key, which was missing from the
invalidation list.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test P0 fix — CampaignDetailsPage**

Log in as the restaurant user (Harbormill). Navigate to Business Sponsorships page. Click "View Campaign" on the accepted "Crave the Classic" sponsorship. Verify: page loads without crash, style direction renders as labeled sub-fields (Mood, Visual Style, Color Palette, References).

- [ ] **Step 3: Test P0 fix — CampaignDetailModal**

Log in as a creator. Browse available campaigns. Open a campaign with AI analysis in the swipe/browse modal. Verify: style direction renders as an italic sentence (joined sub-fields), no crash.

- [ ] **Step 4: Test P1 fix — Edit form**

Log in as the restaurant user. Navigate to the campaign edit page for "Crave the Classic." Verify: the style direction textarea displays readable text like "Energetic, festive, and inviting. Bright, natural lighting with warm tones..." — not `[object Object]`.

- [ ] **Step 5: Test edge cases**

- View a campaign with no `ai_analysis` (null) — page loads normally, no regression
- View a campaign where `style_direction` sub-fields are partially populated — only non-empty fields render

- [ ] **Step 6: Run TypeScript check one final time**

Run: `npx tsc --noEmit`
Expected: No errors
