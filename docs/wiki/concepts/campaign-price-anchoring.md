---
title: Campaign Price Anchoring & Negotiation Reach
type: concept
created: 2026-07-19
updated: 2026-07-20
sources: [2026-07-19-campaign-price-anchoring.md, 2026-07-20-apply-to-campaign-overload.md]
tags: [pricing, campaigns, negotiation, donny, marketplace, ux]
---

# Campaign Price Anchoring & Negotiation Reach

What a business pays a creator for a campaign: how the number is proposed, who sets it, and
who is allowed to argue with it. Distinct from [[Pricing Architecture]], which is how
DragonCandy monetizes the *platform* (subscription, take-rate, credits, rush surcharge) —
this page is the money that flows **between** two users, and it is the number both sides
judge the marketplace by.

## The two-sided anchor problem

A campaign price is read by two people with opposite fears:

- The **business** sees a number and asks "is this what I have to pay?" Too high and they
  never post.
- The **creator** sees the same number and asks "is this worth my time?" Too low and they
  never apply.

Anchoring is therefore not a cosmetic concern. Before 2026-07-19, generation emitted roughly
**$400 per deliverable** and the campaign editor **pre-filled** it, so an $800 figure arrived
looking settled — agency pricing shown to a first-time local restaurant.

## Why the fix was upstream, not in the label

The instinct is to relabel the pre-filled number as "Suggested". That only moves the anchor
one line down; the business still reads it as the expected price.

The real cause was that `donny-campaign-generate` had **no pricing guidance at all**. Its
prompt asked for a bare `"price": <number>` — no floor, no ceiling, no market anchor, no
relation to deliverable count or delivery tier. Given nothing to price against, the model
free-associated. The `2026-05-19` fixed-price spec had *intended* deliverable/platform/timeline
inputs, but the shipped prompt never encoded them.

**The rule:** when a generated value is wrong, check whether the generator was ever told what
right looks like. A pre-filled bad number and a suggested bad number are the same number.

## How it works now

**Bands live in one place.** `src/lib/campaignPricing.ts` owns every figure — the prompt in
`donny-campaign-generate/lib.ts` states the same numbers, and the two are kept in sync by a
test on each side.

| Tier | Per deliverable | 2-deliverable campaign |
|------|-----------------|------------------------|
| `standard` (5–7 days) | $75 – $150 | $150 – $300 |
| `express` (24–48h) | $110 – $225 | $220 – $450 |
| `dragondash` (1–3h) | $150 – $300 | $300 – $600 |

**The field starts empty.** Generation returns `suggested_price_min` / `suggested_price_max`
alongside its single `price` pick, but nothing pre-fills — `useCampaignCreator` defaults
`fixed_price` to `0`. Beneath the empty field sit the range and three one-tap `AppChip`
amounts (low / mid / high), so setting a price is a tap rather than typing — the North Star
ordering (tap-a-chip over typing) applied to the one field that most needs deliberation.

**The copy is honest about what the range is.** DragonCandy is pre-revenue with zero completed
campaigns, so there is no market data behind the number. The UI says "a starting point, not a
market rate" and attributes it to Donny. Claiming market data the platform does not have would
be the same anchoring problem wearing a lab coat.

**Degradation is deliberate.** `getSuggestedRange()` prefers Donny's figures — he can weigh
campaign complexity a formula cannot — and falls back to `deliverableCount × band` when they
are absent. So the anchor drops on frontend merge alone; deploying the edge function only adds
per-campaign judgment. Both deploy orders parse (the fields are `.optional()`).

**Stale suggestions are detected, not scaled.** Donny's figures describe the idea *as
generated*. Once the business edits the deliverables or the tier, the editor falls back to the
band rather than trying to rescale a judgment that no longer applies.

## Negotiation reach

The counter-offer system — the `application_counter_offers` table, the RPCs, the notification,
the negotiation thread, the business accept/decline — has existed since 2026-02 (see
[[Campaign Lifecycle]] for the state machine). Its problem was never capability. It was
**reach**: `OneTapApplySheet` gated the UI on `isInvited`, so only a creator who arrived
through an invitation could counter. A creator who found a campaign in browse saw a single
"Looks good — Send" button and no indication the price was arguable.

Since 2026-07-19 any creator can counter from the apply sheet, with the price explicitly
marked negotiable at the point of decision. Two divergent apply UIs still exist
(`CampaignApplyForm` in the browse modal always allowed an offer; `OneTapApplySheet` did not) —
the behaviour is converged, the duplication is not.

## Gotchas

**A crew campaign's `fixed_price` is `0`, not `null`.** So `isFixedPrice`
(`fixed_price != null`) is **true** for crew campaigns. Dropping the `isInvited` term therefore
exposed a "$50 minimum" counter-offer form on campaigns the database declares free
(`campaigns_group_free`, see [[Creator Groups (Crews)]]) — the invite gate had been masking it
by accident. Gate on `group_id`, not on a nullable-looking numeric. Generalized: **a
`!= null` check is not an "is this paid?" check** once a sibling feature writes a real `0`.

**`isInvited` carries no authorization weight.** It never reaches the database; it only selects
which client-side pre-check runs in `useCreateApplication`. It also derives partly from
`?invited=true` in the URL, so it was never a control — any creator could unlock the old
negotiation UI from the address bar. Treat it as a UI hint only.

**A half-written negotiation is worse than a failed one.** The counter-offer row insert was
fire-and-forget: on failure the application sat at `counter_offered` with no offer row, so the
business saw "counter offered" with nothing to accept or decline. Rare while invited-only,
routine once it became the default path.

**A $0 public campaign renders as "Budget TBD"**, not "Free" — `formatBudget` treats `0` as
falsy and only `formatCampaignPrice` special-cases crews. The launch gate now blocks new ones,
but `CampaignEditPage`'s $50 warning is still display-only, so a published campaign can be
edited back down.

**Two RPC overloads → PostgREST `PGRST203` → a generic "Failed to submit"
(2026-07-20, PR #321).** `apply_to_campaign` had *two* overloads on the database — the original
6-arg and a 7-arg superset that added `p_portfolio_url`. **PostgREST resolves RPC calls by
argument NAME**, so any call omitting `p_portfolio_url` (a 6-key body) matched **both** →
`PGRST203 "Could not choose the best candidate function"`. That message contains neither
`row-level security` nor `violates row`, so `useCreateApplication.onError` fell through to its
generic default toast **and no row inserted** — indistinguishable, from the UI, from a network
blip. Fixed by **dropping the obsolete 6-arg overload** (the surviving 7-arg's `p_portfolio_url`
`DEFAULT NULL` covers 6-key callers). **Generalized: two overloads where one is a
superset-via-DEFAULT is a latent landmine — the call with the *smaller* key-set is ambiguous;
prefer one function with optional params.** Two debugging notes worth keeping: (1) `execute_sql`
runs SQL *directly* and bypasses PostgREST, so it will not reproduce a resolution error — probe
`/rest/v1/rpc/<fn>` over HTTP to see `PGRST203`; (2) reproduce an RPC *as a specific user* by
`set_config('request.jwt.claims', …, true)` inside a `DO` block that `RAISE`s to roll back. See
[[Apply Overload PGRST203 Session]].

## Known issues

- `CampaignEditPage`'s minimum-price warning does not block save — a published campaign can be
  edited to $0 after launch.
- A creator cannot **initiate** a counter after applying; `AppliedPhaseView` gates the whole
  panel on an existing offer, so accepting at the asking price closes negotiation permanently.
- `create_counter_offer` performs no authorization — tracked on
  [[Service-Role Data Exposure]].

## See Also

- [[Apply Overload PGRST203 Session]] — the apply_to_campaign overload fix on this same surface
- [[Campaign Price Anchoring Session]] — the session that shipped this
- [[Campaign Generation Creativity]] — the same prompt and `lib.ts`, on idea quality
- [[Campaign Lifecycle]] — the application/counter-offer state machine
- [[Pricing Architecture]] — platform monetization, the other pricing subject
- [[Creator Groups (Crews)]] — why crew campaigns must stay out of the negotiation path
- [[Service-Role Data Exposure]] — the `create_counter_offer` authorization gap
- [[Light-App Kit]] — `AppChip`, the primitive the price chips use
