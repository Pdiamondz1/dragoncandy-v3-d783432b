# Scope-of-Work Time Validation — Design Spec

**Date:** 2026-04-04
**Scope:** Campaign wizard Step 5 (Review & Launch) — `CampaignFinalizeStep`
**Goal:** Validate that campaign deliverables are achievable within the selected delivery tier's time window. Warn or block launch when scope exceeds capacity.

---

## Decisions

- **Photo baseline:** Styled/complex (60 min) — campaign photos are brand content, not casual snapshots
- **Reel duration split:** `max_duration_seconds > 30` triggers long-reel estimate (105 min vs 75 min)
- **Footage discount:** 30% edit-time reduction applies to both `business_footage` and `hybrid` content sources
- **Quick-fix suggestions:** Deterministic (no AI call). Recommend removing the longest deliverable or upgrading tier
- **Architecture:** Inline card in `CampaignFinalizeStep`, not a separate wizard step. One hook, one component, one edit to existing file.

---

## 1. Time Estimate Config

New file: `src/lib/scopeEstimates.ts`

### Base Deliverable Times (minutes)

| Content Type | Time | Breakdown |
|---|---|---|
| `photo` | 60 | 30 shoot + 30 edit |
| `video_reel` (≤30s) | 75 | 30 shoot + 45 edit |
| `video_reel` (>30s) | 105 | 45 shoot + 60 edit |
| `story` | 40 | 20 shoot + 20 edit |
| `carousel` | 120 | ~2x photo (multiple styled shots) |
| `tiktok` (≤30s) | 75 | Same as short reel |
| `tiktok` (>30s) | 105 | Same as long reel |
| `youtube_short` (≤30s) | 75 | Same as short reel |
| `youtube_short` (>30s) | 105 | Same as long reel |

### Buffers

| Buffer | Minutes |
|---|---|
| Travel/setup | 30 (flat) |
| Review/revision | 15 (flat) |

### Constants

| Constant | Value |
|---|---|
| `FOOTAGE_DISCOUNT` | 0.3 (30% edit-time reduction) |
| `LONG_VIDEO_THRESHOLD` | 30 seconds |

### Footage Discount Logic

When `contentSource` is `business_footage` or `hybrid`, each deliverable's edit portion is reduced by 30%. Since edit time is roughly half of total time for most types, the effective per-deliverable reduction is approximately 15%.

Implementation: `adjustedTime = baseTime * (1 - FOOTAGE_DISCOUNT * editRatio)` where `editRatio` is the edit portion of the total (e.g., 0.5 for photo, 0.6 for video_reel).

Edit ratios by type:

| Content Type | Edit Ratio |
|---|---|
| `photo` | 0.50 (30 edit / 60 total) |
| `video_reel` (≤30s) | 0.60 (45 edit / 75 total) |
| `video_reel` (>30s) | 0.57 (60 edit / 105 total) |
| `story` | 0.50 (20 edit / 40 total) |
| `carousel` | 0.50 |
| `tiktok` (≤30s) | 0.60 |
| `tiktok` (>30s) | 0.57 |
| `youtube_short` (≤30s) | 0.60 |
| `youtube_short` (>30s) | 0.57 |

---

## 2. useScopeValidation Hook

New file: `src/hooks/useScopeValidation.ts`

### Inputs

```typescript
{
  deliverables: Deliverable[]
  deliveryTier: DeliveryTier
  contentSource: ContentSource
}
```

### Output

```typescript
{
  totalMinutes: number
  status: 'ok' | 'warn' | 'block'
  statusMessage: string
  suggestion: string | null
  footageSavingsMinutes: number
  breakdown: { label: string; minutes: number }[]
}
```

### Tier Thresholds

| Tier | Warn (minutes) | Block (minutes) |
|---|---|---|
| DragonDash | >150 | >180 |
| Express | >360 | — (warn only) |
| Standard | No validation (≤10 deliverables enforced elsewhere) |

### Status Messages

- `ok`: "Achievable within [tier label] window"
- `warn`: "Tight — creator may need to work fast"
- `block`: "Exceeds [tier label] capacity. Reduce scope or upgrade."

### Quick-Fix Suggestion Algorithm

1. Find the deliverable with the longest estimated time
2. If removing it brings total under threshold → "Remove the [type] to save ~X min"
3. If not → "Switch to [next tier] for more flexibility" (DragonDash→Express, Express→Standard)
4. Edge case: if removing 2 smallest deliverables would fix it (but removing 1 largest won't), suggest removing 2 smallest to minimize campaign impact

### Computation

Pure, synchronous. Runs on mount and is reactive to input changes. No API calls.

---

## 3. ScopeValidationCard Component

New file: `src/components/campaigns/ScopeValidationCard.tsx`

### Placement

Inside `CampaignFinalizeStep.tsx`, between the deliverables list (~line 429) and the `CostBreakdown` component (~line 432).

### Visual Design

- White card, `rounded-2xl`, `p-4` (matches existing review step cards)
- Clock icon from lucide-react as section header icon
- Heading: "Estimated Creator Time"

### Three States

| Status | Border Class | Icon | Color |
|---|---|---|---|
| `ok` | `border-teal-300` | `CheckCircle` (lucide) | Teal |
| `warn` | `border-yellow-400` | `AlertTriangle` (lucide) | Yellow/amber |
| `block` | `border-red-400` | `XCircle` (lucide) | Red |

### Card Layout

1. **Header row:** Status icon + status message + formatted total time (~X hrs Y min)
2. **Breakdown list:** Each deliverable as a row — type label + estimated minutes (`text-sm text-gray-500`)
3. **Buffer rows:** Travel/setup buffer + Review/revision buffer (same styling as deliverables)
4. **Footage savings** (conditional): Teal checkmark + "Your footage saves ~X min" — only shown when `footageSavingsMinutes > 0`
5. **Suggestion callout** (conditional): `bg-gray-50 rounded-xl p-3` — only shown for `warn` or `block` status

### Launch Button Gating

In `CampaignFinalizeStep.tsx`, the "Create & Publish" / "Create & Pay" button receives `disabled={scopeValidation.status === 'block'}` with `opacity-50 cursor-not-allowed` styling. The "Save Draft" button is unaffected.

---

## 4. Files Changed

| File | Change |
|---|---|
| `src/lib/scopeEstimates.ts` | **New** — time config object, edit ratios, thresholds |
| `src/hooks/useScopeValidation.ts` | **New** — pure computation hook |
| `src/components/campaigns/ScopeValidationCard.tsx` | **New** — validation card UI |
| `src/components/campaigns/CampaignFinalizeStep.tsx` | **Edit** — import + render card, gate launch button |

No other files modified. No new API calls. No database changes.

---

## 5. Constraints

- Mobile-first layout (375–430px)
- Tailwind only, no custom CSS
- No modifications to other wizard steps or pages
- `npm run build` must succeed
- Deterministic suggestions only (AI hook reserved for future)
