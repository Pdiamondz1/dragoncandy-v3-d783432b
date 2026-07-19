# Session — Delivery timing + tier merged into one selection (2026-07-19)

Branch: `worktree-dc-improvements-4`. Founder-reported UI issue, from a screenshot of the
campaign builder's **Logistics & Targeting** step.

## The report

> "The delivery method (DragonDash, Express, and Standard) and the delivery tiers need to
> be one feature/selection. In the screenshot you have to select each separately. It needs
> to be one selection. Can we fix this?"

## What was actually wrong — worse than a layout problem

The step asked the same question twice:

1. **"When do you need this posted?"** — four cards (This Weekend / Next Week / Within 2
   Weeks / Flexible), each with a grey subtitle naming a tier ("DragonDash or Express",
   "Express", "Standard", "Standard").
2. **"Delivery Tier"** — a badge (`Standard · 5–7 days`) with its own **Change** link
   opening an inline three-row dropdown.

They were not merely adjacent — they were **fully decoupled**:

- `TimelinePicker.tsx` wrote **only** `deadline`. Its `suggestion` tier subtitles were
  cosmetic strings that set nothing.
- `TierBadge.tsx` wrote **only** `delivery_type` — the field carrying the fee
  (+$75 / +$25 / $0), the deliverable cap, the SLA countdown, and the Stripe escrow line
  item.

So "This Weekend" + Standard tier was reachable: a campaign whose card promised a weekend
turnaround while the invoice and the auto-approval clock said 5–7 days. Verified by
grepping every `delivery_type` write site in `src/` — the only auto-derivation was at AI
idea-selection time (`useCampaignCreator.ts:37-59`); after that the two controls never
spoke again. The italic `tier_reasoning` line was also never recomputed, so it kept
explaining a tier the user had since changed away from.

## Decisions (founder, in-session)

| Question | Decision |
|---|---|
| Which language leads? | **Tier leads — 3 options.** Deadline derived from the tier. |
| Keep "Pick a specific date"? | **Yes, and the tier follows the date** — the escape hatch can't reintroduce drift. |
| Fix the conflicting SLA tables too? | **No — split to a follow-up branch** (see Known Issues). |

Rejected: a 4-option timing-led layout, because "Within 2 Weeks" and "Flexible" resolve to
the same tier and the same fee — two cards identical in everything that costs money.

## What shipped

**`DeliveryScheduleSelector.tsx`** replaces both components. Three options built from
`TIER_LIMITS`, each stating its own turnaround and fee. The key structural move: it emits
**one patch object** containing `deadline` + `delivery_type` together, so a tier without
its matching deadline is *unrepresentable* rather than merely discouraged. The component
has no API for setting one without the other.

**`src/lib/deliverySchedule.ts`** — the pure tier↔deadline derivation, extracted out of the
React file (which also cleared 3 `react-refresh/only-export-components` warnings):

- `deadlineForTier()` / `tierForDeadline()` — exact inverses.
- `isDeadlineAcceptable()` — replaced the launch schema's date check.
- Local-midnight parsing and formatting throughout. The old code used `new Date(deadline)`
  (UTC midnight) against `Date.now()` (local), a latent off-by-one at the boundary.
- `tierForDeadline` **always resolves**; the old `getSelectedUrgency` returned `null` past
  22 days, leaving no card highlighted at all.

**Two money bugs fixed** (both found in review, both pre-existing, both made *live* by this
change — see the concept page for the full mechanism):

1. `useCampaignEditForm` wrote `delivery_type` on save but never `delivery_fee`.
2. `CampaignEditPage` treated `fixed_price` as *inclusive* of the premium while
   `CampaignEditor` and `create-campaign-escrow` treat it as the base. Fixed by extracting
   `computeCampaignCost()` and putting both surfaces on it.

## Codex second review — three rounds, every finding real

Round 1 (2 findings), round 2 (1), round 3 (1), round 4 clean. Notably **each finding was
a consequence of the previous fix**, which is the useful part of the story:

- **R1/P2:** DragonDash wrote *tomorrow* while advertising "1–3 hours"; Express wrote *+3
  days* while advertising "24–48 hours". My offsets had been chosen to make the round-trip
  arithmetic clean, not to match the promise. Reset to 0 / 2 / 7 days, and the reverse
  derivation restated as its own rule: *the cheapest tier whose turnaround can still make
  the date.*
- **R1/P1:** the `delivery_fee` fix exposed the inclusive-vs-exclusive split above.
- **R2/P1:** DragonDash now writing *today* hit the launch schema's
  `new Date(d) > new Date()`, which fails twice over on a date-only string — UTC-midnight
  parsing plus a strictly-future requirement. **Selecting DragonDash made the campaign
  unlaunchable.** The validator was wrong, not the offset: a 1–3 hour tier whose own
  deadline is rejected is a contradiction.
- **R3/P2:** the shared cost formula made a *free crew campaign* print "Total $75.00"
  under "Free crew collab". `CampaignEditor` already scoped its `CostBreakdown` to the
  non-crew branch; `CampaignEditPage` rendered it unconditionally. Display-only — the crew
  override still forces `delivery_fee = 0` on save.

## Verification

- 21 new tests (16 helper/validation + 5 cost). Full suite **1051 passed**, up from a 1039
  baseline; 133 files.
- `npm run typecheck` clean, `npm run lint` clean on all touched files (the 2 remaining
  warnings are in untouched `src/lib/ndjson.ts`), `npm run build` green.
- Codex clean on round 4.

## Files

- **New:** `src/components/campaign-creator/DeliveryScheduleSelector.tsx` (+ test),
  `src/lib/deliverySchedule.ts` (+ test), `src/lib/campaignCost.test.ts`
- **Deleted:** `TimelinePicker.tsx`, `TierBadge.tsx`
- **Changed:** `CampaignEditor.tsx`, `CampaignEditPage.tsx`, `useCampaignEditForm.ts`,
  `campaignUtils.ts`, `campaignCreatorValidation.ts`

No migration, no edge-function deploy. `delivery_type` / `deadline` / `delivery_fee` keep
their existing types and CHECK constraint.

## Known issues / follow-ups

**The three tiers carry five mutually contradictory turnaround tables.** Found during
exploration, deliberately not fixed here — it reaches into escrow and auto-approval:

| Source | DragonDash | Express | Standard |
|---|---|---|---|
| `types/campaignMedia.ts` (canonical) | 1–3 hrs | 24–48 hrs | 5–7 days |
| `hooks/useDragonDashTimer.ts` | 2 hrs | **10 hrs** | **72 hrs** |
| `create-campaign-escrow/index.ts` | 1–3 hrs | **8–12 hrs** | **72 hrs** |
| `campaigns/ApplicationForm.tsx` | 1–3 hrs | **8–12 hrs** | **72 hrs** |
| `campaign-creator/TierBadge.tsx` (now deleted) | same-day | 48 hrs | **5 business days** |

A Standard campaign is **displayed** as 5–7 days, **invoiced** as 72 hours, and
**auto-approves** against a 72-hour clock.

Also noted, not fixed: `match-creators/index.ts:142` dumps the raw `delivery_type` string
into a keyword bag scored against creator *skills*, so the literal token `dragonrush` is
matched against skill words.

**Not independently verified:** the authenticated campaign builder could not be exercised
in a browser this session (local dev login redirects to prod). Behaviour is covered by the
component tests; the visual pass is founder/preview verification.
