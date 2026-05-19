# Campaign Fixed-Price Negotiation System

> Replaces the dual pricing model (fixed / bid_range) with a single AI-suggested
> price and eBay/Poshmark-style "Make an Offer" negotiation. Reduces campaign
> creation to zero keystrokes on price (Donny pre-fills it) and gives creators a
> clear accept-or-counter-offer flow.

## Problem

The current system offers two pricing modes:

1. **Fixed price** — business sets a single price, creator takes it or leaves it.
2. **Bid range** — business sets min/max, creator proposes a rate within that range.

This creates confusion: creators don't know what to bid, businesses don't know where
in the range is "fair," and the wizard requires extra fields and decision-making.
Meanwhile, the counter-offer mechanism (`application_counter_offers`) already exists
but sits as a secondary feature rather than the primary negotiation path.

## Solution

Every campaign gets a single Donny-suggested price. The business can edit it. The
creator either accepts it or makes a counter-offer. Unlimited negotiation rounds
until one side accepts or declines. The agreed price lives on the application record
(`proposed_rate`) and counter-offer chain — the campaign's `fixed_price` (the "list
price") is never mutated by negotiation. The existing Stripe escrow flow already
resolves the correct amount from the counter-offer chain.

## Scope

### In scope

- Remove `pricingType` selector from campaign wizard (always fixed)
- Donny AI generates a single price instead of a budget range
- Simplify `CampaignTimelineBudgetStep` to one price field
- Add "Accept Price & Apply" / "Make an Offer" to creator application form
- Enhance counter-offer thread for unlimited back-and-forth
- Agreed price persists on application record, not campaign list price
- Update campaign card to show single price and negotiation status
- Ensure Stripe escrow uses the agreed price

### Out of scope

- Dropping `budget_min`/`budget_max` columns (keep for backward compatibility)
- Auto-accepting applications when creator accepts the price
- AI-suggested price badge visible to creators
- Multi-creator price negotiation within a single campaign
- Changes to sponsorship payment flow

## Design

### 1. Campaign Pricing Model

Donny AI generates a single recommended price per campaign idea. The AI prompt
changes from "suggest a budget range" to "suggest a price" based on deliverables,
platform count, timeline, and delivery tier.

The `CampaignTimelineBudgetStep` simplifies to one editable price field, pre-filled
by Donny's suggestion. The business can change it to any amount they want.

New campaigns always write to `fixed_price` and set `pricing_type = 'fixed'`. The
`budget_min` and `budget_max` fields remain in the database but are no longer written
to for new campaigns. Existing bid_range campaigns continue to function.

**Campaign card display:** Shows the single price (e.g., "$1,200") instead of a range.

### 2. Creator Application & Counter-Offer Flow

When a creator views a campaign, they see the listed price prominently. The
application form presents two paths:

**Accept Price & Apply** — Creator submits their application at the listed price.
`proposed_rate` is set to the campaign's `fixed_price`. Application status =
`'pending'` (awaiting business review).

**Make an Offer** — Creator enters their desired rate plus a message explaining
why. This creates the application with `proposed_rate` = their offer and
simultaneously creates a record in `application_counter_offers` with
`sender_role = 'creator'`. Application status = `'counter_offered'`.

#### Negotiation thread (eBay/Poshmark style)

- When the business views an application with status `'counter_offered'`, they
  see the counter-offer and can: Accept, Decline, or Counter with their own price.
- If they counter, a new `application_counter_offers` row is created with
  `sender_role = 'business'`, and the creator gets notified.
- Either party can keep counter-offering (unlimited rounds). Each new counter-offer
  supersedes the previous one.
- When either side declines: application status transitions to `'rejected'`.

#### Price agreement vs. hiring (two separate actions)

Accepting a counter-offer means "we agree on price" — it is NOT the hiring decision.
The semantics depend on who accepts:

- **Business accepts creator's counter-offer:** This IS both price agreement AND
  the hiring decision. The application's `proposed_rate` updates to the agreed
  price, application status → `'accepted'`, and a collaboration is created. The
  business is choosing to hire this creator at the creator's price.

- **Creator accepts business's counter-offer:** This is price agreement only. The
  application's `proposed_rate` updates to the agreed price, application status →
  `'pending'` (price agreed, awaiting business approval). The business still needs
  to review and approve the creator before hiring.

This distinction preserves the business's control over who they hire, while letting
price negotiation happen independently.

#### Campaign list price is immutable during negotiation

The campaign's `fixed_price` is the "list price" and is never mutated by
negotiation. The agreed price lives on the application record (`proposed_rate`)
and in the counter-offer chain. This is critical for multi-applicant campaigns
where different creators may negotiate different prices simultaneously.

The `create-campaign-escrow` edge function already resolves the correct payment
amount via: accepted counter-offer rate → accepted application rate → campaign
`fixed_price`. No changes needed to this priority chain.

Either party may decline at any point during negotiation to withdraw. If a
collaboration is cancelled after agreement, the campaign retains its original
list price and can be re-published for new applicants.

### 3. Stripe Payment Integration

The `create-campaign-escrow` edge function already has the right priority logic:
accepted counter-offer rate → accepted application rate → campaign `fixed_price`.
Since the agreed price is stored on the application and counter-offer records, the
function resolves the correct amount without any changes. The campaign's `fixed_price`
serves as the final fallback (the list price) if no negotiation occurred.

**Fee breakdown (what the business sees):**
- Campaign Price: agreed amount
- DragonDash Rush: delivery fee (if applicable)
- Platform Fee: based on org take rate
- Total: sum of above

No changes needed to:
- Stripe checkout session creation (`create-campaign-escrow`)
- Webhook handler (`stripe-webhook`)
- Escrow verification (`verify-campaign-escrow`)
- Creator payout (`release-creator-payout`)

These already read from `fixed_price` and the counter-offer chain.

### 4. UI Changes

#### Campaign Creation Wizard (`CampaignTimelineBudgetStep`)

- Remove `PricingTypeSelector` component
- Remove `budgetMin`/`budgetMax` fields from the form schema
- Show one price input field, pre-filled with Donny's AI-suggested price
- Label: "Campaign Price" with helper text "What you'll pay the creator"

#### Campaign Card (`CampaignCard`)

- Show single price (e.g., "$1,200") instead of range ("$800-$1,800")
- When a counter-offer is pending: show badge in the application row
- When application is accepted: show "Price agreed — $X" and the "Pay & Publish" button (derive from accepted application's `proposed_rate`)

#### Creator Campaign Listing / Detail

- Show listed price prominently
- Application form: "Accept Price & Apply" (primary CTA) and "Make an Offer" (secondary)
- "Make an Offer" expands a rate input + message field

#### Application Review (Business side)

- If creator accepted the price: show "Accepted at $X" — business reviews and approves/rejects the creator
- If creator made an offer: show negotiation thread with Accept / Decline / Counter buttons
- Counter-offer thread uses the existing `CounterOfferThread` component, enhanced for full history

#### Application Detail (Creator side)

- Show current offer status: "Your offer: $X — Waiting for response" or "Counter-offer: $Y"
- Accept / Decline / Counter buttons when it's the creator's turn

### 5. Donny AI Changes

#### `donny-campaign-generate` edge function

Change the AI prompt to return a single `price` field instead of `budget_range.min/max`.

**Before:**
```json
{ "budget_range": { "min": 800, "max": 1800 } }
```

**After:**
```json
{ "price": 1200 }
```

The price is calculated based on deliverables, platform count, timeline, and delivery
tier. The business can override it in the wizard.

#### `generate-campaign-analysis` edge function

Similarly update the budget_recommendations to return a single recommended price.

#### Backward compatibility for AI response format

The AI response parser should accept both `{ price: N }` (new format) and
`{ budget_range: { min, max } }` (old format). If `price` is present, use it.
Otherwise fall back to `budget_range.max`. This handles cached or stale responses
gracefully.

#### `CampaignTimelineBudgetStep` component

The existing `getAiRecommendedPrice()` function (hardcoded tier-based defaults)
is replaced by reading the AI-generated price from the campaign idea data.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignTimelineBudgetStep.tsx` | Remove pricing type selector, simplify to single price field |
| `src/components/campaigns/PricingTypeSelector.tsx` | Remove or deprecate |
| `src/components/campaigns/CampaignApplyForm.tsx` | Add "Accept Price / Make Offer" dual path |
| `src/components/campaigns/CampaignCard.tsx` | Show single price, negotiation status |
| `src/components/campaigns/CounterOfferModal.tsx` | Enhance for creator-initiated offers |
| `src/components/campaigns/CounterOfferThread.tsx` | Full negotiation history display |
| `src/hooks/useCounterOffers.ts` | Split acceptance logic: business-accepts = hire, creator-accepts = price agreed only. Update application `proposed_rate` to agreed amount on acceptance. |
| `src/hooks/useBrandCampaignWizard.ts` | Remove bid_range fields from wizard state |
| `supabase/functions/donny-campaign-generate/index.ts` | Single price instead of budget range |
| `supabase/functions/generate-campaign-analysis/index.ts` | Single price recommendation |
| `src/components/campaigns/CampaignFinalizeStep.tsx` | Remove bid_range branching logic |

## Verification

1. Create a campaign as restaurant — verify Donny suggests a single price, wizard has one price field
2. As creator, view campaign — verify price is shown, "Accept Price & Apply" and "Make an Offer" options work
3. As creator, accept price and apply — verify application is created with `proposed_rate` = listed price, status = `'pending'`
4. As creator, make an offer — verify counter-offer is created, application status = `'counter_offered'`, restaurant is notified
5. As restaurant, counter-offer — verify creator sees it, can accept/decline/counter
6. As creator, accept business's counter-offer — verify `proposed_rate` updates, application status returns to `'pending'` (NOT `'accepted'`), campaign `fixed_price` is unchanged
7. As business, accept creator's counter-offer — verify application status → `'accepted'`, collaboration created
8. As business, decline a counter-offer — verify application status → `'rejected'`, creator is notified
9. Click "Pay & Publish" after acceptance — verify Stripe checkout shows the agreed amount (from counter-offer chain) + fees
10. Complete payment — verify escrow is held, collaboration status is active
11. Check existing bid_range campaigns still display and function correctly
12. Multiple creators apply to same campaign — verify each negotiation is independent, campaign list price stays constant
13. Race condition: two responses to the same counter-offer at once — verify the existing race guard (`eq('status', 'pending')`) prevents double-processing
14. Counter-offer minimum: verify counter-offers enforce a $50 minimum (matching campaign wizard minimum)
