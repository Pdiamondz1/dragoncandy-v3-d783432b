# Session — Campaign price anchoring + opening negotiation to all creators

**Date:** 2026-07-19
**Branch:** `worktree-dc-improvements-7` (2 commits)
**Trigger:** Founder (Joe) feedback — the generated campaign price is too high to start, and
because it arrives pre-filled a business owner reads it as the required price.

## The ask

Two halves, one from each side of the marketplace:

1. **Business.** Right after a campaign is generated, the price should read **$0** with a
   suggested price beneath it, so the business sets the number themselves. Joe's reasoning:
   the price is too high to start, and psychologically a pre-filled figure turns businesses
   off because they assume that is what they must pay.
2. **Creator.** Remind creators they can negotiate — they do not have to flatly accept the
   posted price. Unfavourable pay drives creators away just as a high price drives businesses
   away.

## The insight that shaped the work

Relabelling `$800` as "Suggested: $800" would only move the anchor one line down. The number
itself was the problem, and its cause was upstream: `donny-campaign-generate` had **zero**
pricing guidance. `lib.ts` asked for a bare `"price": <number>` with no floor, ceiling, market
anchor, or relation to deliverable count / tier — so the model free-associated its way to
roughly **$400 per deliverable**, agency pricing shown to a first-time local restaurant.

So the fix had to be the anchor, not the label.

The creator half turned out not to need new machinery either. The whole counter-offer
system — RPCs, notification, negotiation thread, business accept/decline — already existed and
worked. It was simply **unreachable**: `OneTapApplySheet.tsx` gated it on
`isInvited && isFixedPrice && onCounterOffer`, so a creator who found a campaign organically
saw only "Looks good — Send".

## What shipped

### Pricing anchor (business)

- **`donny-campaign-generate/lib.ts`** — new `pricingGuidance()` block stating these are local,
  single-location businesses trying the platform for the first time, with per-deliverable bands
  by tier, plus two new schema fields `suggested_price_min` / `suggested_price_max`. `price`
  survives as Donny's single pick inside the range but no longer pre-fills anything.
- **`src/lib/campaignPricing.ts`** (new) — single source for every figure:
  `MIN_CAMPAIGN_PRICE = 50`, `TIER_PRICE_BANDS`, `getSuggestedRange()`, `getPriceChips()`,
  `formatSuggestedRange()`. 14 co-located unit tests.
- **`CampaignEditor.tsx`** — price field starts empty with a `0` placeholder; beneath it the
  suggested range and three one-tap `AppChip` amounts (low/mid/high). Cost Breakdown hides
  below the $50 floor, where it rendered "(2 × $0.00)".
- **`useCampaignCreator.ts`** — `fixed_price` / `per_creator_cap` default to `0`, replacing a
  magic `?? 500`.
- **`LaunchButton` / `LaunchpadScreen`** — launch gated on a real price with a plain message.
  Crew campaigns exempt.
- **`IdeaCard.tsx`** — carousel shows the range, so the anchor does not reappear a screen
  earlier.

**Founder-approved bands (per deliverable):** standard $75–$150, express $110–$225,
dragondash $150–$300. The screenshot's campaign (2 deliverables, standard) goes from a
pre-filled **$800** to an empty field suggesting **$150–$300** — roughly a 4× drop.

### Negotiation reach (creator)

- **`OneTapApplySheet.tsx`** — gate becomes `isFixedPrice && campaign.group_id == null &&
  onCounterOffer`. Price row gains "This price is negotiable — you can counter-offer below",
  and `${displayRate}` gains `toLocaleString()` (it rendered `$1500`, not `$1,500`).
- **`CampaignDetailsPage.tsx`** — `handleCounterOffer` passed a hardcoded `isInvited: true`;
  it now passes the real value.
- **`useCreateApplication.ts`** — a failed counter-offer insert was a silent `console.error`,
  leaving the application at `counter_offered` with no offer row for the business to answer.
  It now throws.

## Gotchas worth keeping

**A crew campaign's `fixed_price` is `0`, not `null`.** So `isFixedPrice`
(`campaign.fixed_price != null`) is **true** for crew campaigns, and dropping the `isInvited`
term exposed a "$50 minimum" counter-offer form on campaigns the DB declares free
(`campaigns_group_free`). The old invite gate had been masking this by accident. Both Codex
and the `data-exposure-reviewer` caught it independently; fixed by gating on `group_id`.
The general rule: **a nullable-looking numeric guard is not a "is this paid?" guard** when a
sibling feature writes a real `0`.

**`isInvited` never reaches the database.** It only selects which client-side pre-check runs
in `useCreateApplication`. A comment written during this session claimed it drives the RLS
INSERT policy; that was wrong and was corrected. Worth stating because the reviewer also noted
`isInvited` derives partly from `?invited=true` in the URL — so it was never a control at all,
and any creator could already unlock the negotiation UI by editing the address bar.

**The frontend degrades correctly without the edge deploy.** `getSuggestedRange` falls back to
`deliverableCount × band` when `suggested_price_*` is absent, so the anchor drops to $150–$300
on frontend merge alone; deploying the function only adds Donny's per-campaign judgment. Both
deploy orders parse safely (the fields are `.optional()`), confirmed by `edge-function-reviewer`.

**A pre-existing test constrained the prompt wording.** `lib.test.ts` asserts the prompt
contains no `\bMUST\b` — a guard from PR #243 keeping *platform* guidance a soft preference.
The pricing block was reworded to "has to" rather than weakening someone else's guard.

## Review outcome

- `edge-function-reviewer`: **PASS** (no backticks, no new `_shared` imports, `verify_jwt`
  unchanged, deploy order safe either way).
- `data-exposure-reviewer`: **ISSUES** — found the crew-campaign regression above (fixed), plus
  pre-existing findings recorded separately.
- Codex (`--base main`): flagged the same crew regression independently, then **clean** on
  re-run.
- typecheck ✓ · lint ✓ · 1057 tests ✓ · `npm run build` ✓

## Filed, not fixed (pre-existing)

`create_counter_offer` (`20260521000003_atomic_counter_offer.sql`) is `SECURITY DEFINER` and
performs **no authorization at all** — it never checks `p_sender_id = auth.uid()`, never checks
the caller is a participant, never validates `p_sender_role`. Being definer it bypasses RLS on
both `campaign_applications` and `application_counter_offers`. It is live today via
`useCounterOffers.ts`. This session deliberately did **not** route the newly-widened apply path
through it — the direct insert is RLS-checked — but the gap stands on its own. Scoped honestly:
the forged value feeds `agreed_rate` → `increment_budget_spent` (budget accounting), not Stripe
movement. Recorded on [[Service-Role Data Exposure]] as a tracked finding.
