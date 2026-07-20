---
title: Delivery Tier Selection
type: concept
created: 2026-07-19
updated: 2026-07-19
sources: [2026-07-19-delivery-tier-timing-merge.md]
tags: [campaigns, delivery, dragondash, pricing, ui, escrow]
---
# Delivery Tier Selection

How a business chooses delivery speed on a campaign, and why that is **one** selection
rather than two. Covers the tier↔deadline derivation, the vocabulary split between UI and
DB, and the cost invariant that ties the displayed total to what Stripe actually charges.

## The three tiers

Canonical definition is `TIER_LIMITS` in `src/types/campaignMedia.ts` — the single source
of truth for label, turnaround and fee.

| Tier (UI) | DB `delivery_type` | Turnaround | Fee | Max deliverables |
|---|---|---|---|---|
| `dragondash` | `dragonrush` | 1–3 hours | +$75 | 2 |
| `express` | `expedited` | 24–48 hours | +$25 | 4 |
| `standard` | `standard` | 5–7 days | $0 | 10 |

**The UI and DB vocabularies differ** (`dragondash`/`dragonrush`,
`express`/`expedited`). Never write a raw string — cross the boundary with
`mapDeliveryType()` (DB→UI) and `mapDeliveryTierToDb()` (UI→DB) in `src/lib/campaignUtils.ts`.

## One selection, not two

Until 2026-07-19 the builder asked twice: a **"When do you need this posted?"** picker
(This Weekend / Next Week / Within 2 Weeks / Flexible) and a separate **Delivery Tier**
badge with its own "Change" dropdown. The two were fully decoupled — the timing picker
wrote only `deadline`, its tier subtitles were cosmetic strings, and the tier badge wrote
only `delivery_type`. A campaign could promise a weekend turnaround while being priced and
timed as Standard.

`DeliveryScheduleSelector` replaces both. The design rule that matters:

> **It emits one patch containing `deadline` and `delivery_type` together.** There is no
> API for setting one without the other, so the inconsistent state is *unrepresentable*
> rather than merely discouraged.

"Pick a specific date" survives, and re-derives the tier from the chosen date — otherwise
the escape hatch would reintroduce exactly the drift the merge deleted.

Per [[Musk's Algorithm]]: this **deletes** a control and two of the six options, and
removes a keystroke from every campaign (one tap instead of two selections).

## The derivation (`src/lib/deliverySchedule.ts`)

Pure functions, no React, unit-tested:

- **Forward** — `deadlineForTier()`: DragonDash → today, Express → +2 days, Standard →
  +7 days. **Each date sits inside the turnaround the UI advertises.** Getting this wrong
  is easy: offsets picked to make the round-trip arithmetic tidy produced a "1–3 hours"
  tier whose deadline was *tomorrow*.
- **Reverse** — `tierForDeadline()`: **the cheapest tier whose turnaround can still make
  the date.** A deadline one day out resolves to DragonDash, because Express's 48-hour
  worst case could miss it. A deadline five days out stays Standard — inside its own 5–7
  day window — rather than upselling to Express.
- **`isDeadlineAcceptable()`** — today counts (see below).

Two invariants worth preserving:

1. **Parse and format at local midnight.** `new Date('2026-07-19')` is UTC midnight, which
   is already in the past by morning anywhere west of Greenwich; `toISOString()` has the
   mirror-image bug when writing. Use `` new Date(`${d}T00:00:00`) `` and a local
   formatter. This class of bug bit twice here — once in the old picker's highlight logic
   and once in the launch validator.
2. **The reverse function always resolves.** Its predecessor returned `null` past 22 days,
   which rendered as *no option highlighted at all*.

## Same-day deadlines must be launchable

The launch schema used to require `new Date(d) > new Date()`. For a date-only string that
fails twice over — UTC-midnight parsing, plus a strictly-future requirement that rejects
today outright. Once DragonDash correctly wrote today's date, **selecting DragonDash made
the campaign unlaunchable.**

`campaignCreatorValidation.ts` now delegates to `isDeadlineAcceptable()`, which accepts
today and rejects the past. A tier promising 1–3 hour turnaround whose own deadline is
refused is a contradiction — the validator was wrong, not the offset.

## The cost invariant

`create-campaign-escrow` charges **`fixed_price + delivery_fee`**. That is ground truth:
`fixed_price` is the base the creator is paid, and the tier premium sits *on top*.
Anything the UI shows as a total must equal it.

`computeCampaignCost()` (`src/lib/campaignUtils.ts`) is the one implementation, used by
both the builder and the edit page, with a test pinning `budgetTotal === fixed_price +
fee` for every tier.

It exists because the math was duplicated and had silently drifted: `CampaignEditPage`
treated `fixed_price` as *inclusive* (carving the premium back out, showing `fixed_price`
as the total) while `CampaignEditor` and escrow treated it as the base. Two related traps:

- **A stale fee is a real charge.** `useCampaignEditForm` wrote `delivery_type` on save
  but never `delivery_fee`, so editing a campaign's tier changed the promise and left the
  price behind. Both must move together.
- **Free crew campaigns get no cost breakdown at all.** A crew campaign
  ([[Creator Groups (Crews)]]) forces `fixed_price` and `delivery_fee` to 0 on save, so a
  tier premium rendered beside "Free crew collab" contradicts it. Scope the
  `CostBreakdown` to the paid branch.

## Known Issues

**Five conflicting turnaround tables.** The tiers are described differently in at least
five places, and the disagreements are load-bearing:

| Source | DragonDash | Express | Standard |
|---|---|---|---|
| `types/campaignMedia.ts` (canonical) | 1–3 hrs | 24–48 hrs | 5–7 days |
| `hooks/useDragonDashTimer.ts` | 2 hrs | **10 hrs** | **72 hrs** |
| `create-campaign-escrow/index.ts` | 1–3 hrs | **8–12 hrs** | **72 hrs** |
| `campaigns/ApplicationForm.tsx` | 1–3 hrs | **8–12 hrs** | **72 hrs** |
| `pages/CampaignDetailsPage.tsx` | 0 days | 2 days | 7 days |

A Standard campaign is **displayed** as 5–7 days, **invoiced** as 72 hours, and
**auto-approves** against a 72-hour clock. Making `TIER_LIMITS` govern all of them touches
escrow, the auto-approval timer and Stripe line-item text, so it is scoped as its own
branch rather than folded into a UI change.

**`match-creators` scores the tier string as a skill.** `match-creators/index.ts:142`
drops the raw `delivery_type` into a keyword bag matched against creator *skills*, so the
literal token `dragonrush` is compared to skill words. Almost certainly unintended.

## Key Decisions

- **Tier leads the UI, not timing language.** A timing-led layout ("This Weekend" /
  "Flexible") needs four options, two of which resolve to the same tier and the same fee —
  identical in everything that costs money.
- **The escape hatch derives, never overrides.** A custom date sets the tier; it cannot
  leave a tier untouched.
- **Stale AI rationale is cleared, not kept.** `tier_reasoning` describes the tier the AI
  chose. Once the user lands elsewhere it is actively wrong, so it is dropped rather than
  left explaining a tier that is no longer selected.

## See Also

- [[Campaign Lifecycle]] — where the deadline sits in the campaign's life
- [[Content Delivery State Machine]] — what happens after a tier is chosen
- [[Pricing Architecture]] · [[Take-Rate Ladder]] — the take rate is charged on base + fee
- [[Creator Groups (Crews)]] — the free-collab branch that must bypass all of this
- [[Light-App Kit]] — the surface primitives the new control is styled with
- [[Musk's Algorithm]] — delete, then simplify
