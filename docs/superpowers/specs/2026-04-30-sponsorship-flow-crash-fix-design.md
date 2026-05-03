# Sponsorship Flow Crash Fix & End-to-End Audit

**Date:** 2026-04-30
**Status:** Approved
**Scope:** Fix P0 crash on campaign details + 2 P2 sponsorship flow bugs

---

## Problem

When a restaurant user views their Sponsorship Proposals page and clicks "View Campaign," the app crashes with "Something went wrong." The error boundary catches a React render error.

**Root cause:** `ai_analysis.style_direction` is always an object (`{mood, visual_style, color_palette, references}`) but `hydrateCampaignFromAnalysis` casts it as `string`. When `ContentRequirementsSection` renders `{campaign.style_direction}` in a `<p>` tag, React throws "Objects are not valid as a React child."

This crash affects all campaigns with AI analysis viewed through `CampaignDetailsPage`, not only the sponsorship flow. The bug was introduced when shared detail section components were added (commits `5e76de9`, `aa3b638`).

An end-to-end audit of the sponsorship lifecycle found two additional P2 issues.

---

## All Issues

| # | Severity | Issue | File(s) |
|---|----------|-------|---------|
| 1 | P0 | `style_direction` object rendered as React child crashes page | `useCampaignQueries.ts`, `ContentRequirementsSection.tsx` |
| 1b | P0 | Same crash in `CampaignDetailModal.tsx` (swipe/browse view) | `CampaignDetailModal.tsx` |
| 1c | P1 | Edit form displays `[object Object]` when `style_direction` is an object | `useCampaignEditForm.ts` |
| 2 | P2 | "View Campaign" navigates to `/undefined` if campaign deleted | `BrandSponsorships.tsx` |
| 3 | P2 | Cache invalidation uses wrong query key after completion | `useSponsorshipComplete.ts` |

### Verified OK

- RLS policies on `campaigns`, `campaign_sponsorships`, `campaign_media`, `campaign_deliverables`, `campaign_applications`, `campaign_matches` — all correct
- Joint approval columns (`brand_completion_status`, `business_completion_status`, `completed_at`) exist in DB
- Proposal creation, acceptance, rejection, payment, and review flows are structurally sound
- All other hydrated fields in `hydrateCampaignFromAnalysis` are safe (checked against live DB data)
- Overview, Compensation, and Logistics section components handle nulls safely

---

## Fix 1 (P0): Style direction hydration and rendering

### Type change — `useCampaignQueries.ts`

Extract a shared `StyleDirection` interface. The canonical `CampaignAnalysis` type in `src/types/campaign.ts` already defines this shape with required fields. Since AI-generated data may have missing sub-fields, use optional fields and update both locations to share the same interface:

```typescript
// In src/types/campaign.ts — extract and export:
export interface StyleDirection {
  mood?: string;
  visual_style?: string;
  color_palette?: string;
  references?: string;
}

// Update CampaignAnalysis.style_direction to use it:
style_direction?: StyleDirection;

// In Campaign interface (useCampaignQueries.ts) — import and use union:
import type { StyleDirection } from '@/types/campaign';
style_direction?: string | StyleDirection;
```

### Hydration fix — `useCampaignQueries.ts`

Remove the incorrect `as string` cast:

```typescript
// Before:
style_direction: campaign.style_direction || (ai.style_direction as string) || undefined,

// After:
style_direction: campaign.style_direction || ai.style_direction || undefined,
```

### Rendering — `ContentRequirementsSection.tsx`

Detect object vs string at render time:

- **String:** Render in a `<p>` tag (existing behavior, for any future manual entries)
- **Object:** Render each field (mood, visual_style, color_palette, references) as a labeled item, following existing section styling (`text-xs font-medium text-gray-700` labels, `text-sm text-gray-600` body text)
- Each sub-field only renders if present (optional chaining)

### Rendering — `CampaignDetailModal.tsx`

Same crash pattern at line 251. Apply the same object-vs-string detection. For the modal's compact layout, render as a condensed summary rather than labeled items:

- **String:** Render in `<p>` tag as-is
- **Object:** Join non-empty sub-fields with `. ` separator into a single italic paragraph

### Edit form coercion — `useCampaignEditForm.ts`

The edit form's `CampaignEditFormData` types `style_direction` as `string`. When the hydrated campaign has an object, the form textarea would display `[object Object]`. Add a coercion step:

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

This flattens the object into a readable string for editing. When saved, the value persists as a plain string in the campaign record, which is fine — the hydration function will use the DB value over ai_analysis.

---

## Fix 2 (P2): Guard undefined campaign ID in brand navigation

### File: `BrandSponsorships.tsx` line 327

Before:
```tsx
onClick={() => navigate(`/dashboard/brand/campaigns/${sponsorship.campaigns?.id}`)}
```

After:
```tsx
onClick={() => {
  if (sponsorship.campaigns?.id) {
    navigate(`/dashboard/brand/campaigns/${sponsorship.campaigns.id}`);
  } else {
    toast({ title: "Campaign unavailable", description: "This campaign may have been removed.", variant: "destructive" });
  }
}}
```

---

## Fix 3 (P2): Correct cache invalidation after completion

### File: `useSponsorshipComplete.ts`

Add the restaurant-side query key to the `onSuccess` invalidation:

```typescript
queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
```

This ensures the BusinessSponsorships page refreshes after marking a sponsorship complete.

---

## Files Changed

| File | Change |
|------|--------|
| `src/types/campaign.ts` | Extract shared `StyleDirection` interface, update `CampaignAnalysis` |
| `src/hooks/useCampaignQueries.ts` | Import `StyleDirection`, update `Campaign` type, fix hydration cast |
| `src/components/campaign-details/sections/ContentRequirementsSection.tsx` | Structured rendering for object-type style_direction |
| `src/components/campaigns/CampaignDetailModal.tsx` | Safe rendering for object-type style_direction |
| `src/hooks/useCampaignEditForm.ts` | Coerce object style_direction to string for textarea |
| `src/pages/BrandSponsorships.tsx` | Guard undefined campaign ID in navigation |
| `src/hooks/useSponsorshipComplete.ts` | Add missing cache invalidation key |

---

## Testing

- Navigate to Business Sponsorships > click "View Campaign" on an accepted sponsorship — page loads without crash, style direction renders as labeled fields
- View any campaign with AI analysis through CampaignDetailsPage — style direction displays correctly
- View a campaign through the CampaignDetailModal (swipe/browse view) — style direction renders without crash
- Edit a campaign that has object-type style_direction — textarea shows readable text, not `[object Object]`
- View a campaign where style_direction has some sub-fields missing — only populated fields render
- View a campaign with no ai_analysis (null) — no regression, page loads normally
- Delete a campaign that has a brand sponsorship, then view BrandSponsorships — "Campaign unavailable" toast instead of navigation to `/undefined`
- Mark a sponsorship complete from the restaurant side — proposals list refreshes immediately
