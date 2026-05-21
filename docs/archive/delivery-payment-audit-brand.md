# Delivery & Payment Audit: Brand/Sponsor <> Creator Flow

**Date:** 2026-04-07 (Updated)
**Phase:** 1 of 2 (Read-Only Audit)
**Scope:** Section B — Brand/Sponsor to Creator content delivery and payment pipeline (deltas from Section A)

---

## 1. EXECUTIVE SUMMARY

The Brand/Sponsor flow **shares most infrastructure with the Business/Restaurant flow and benefits from all the same safety improvements** (payment_events ledger, webhook idempotency, atomic pending_balance, protected file previews). The sponsorship payment pipeline (Brand pays Restaurant) works end-to-end: Stripe Checkout, webhook handling, bilateral completion, payout to restaurant with idempotency key. **The key gap is that brand-to-N-creators delivery workflow does NOT exist as a separate system** — brands create campaigns that creators apply to individually, using the same single-escrow model as business campaigns. The brand-specific fields (`per_creator_cap`, `creator_count`, `usage_rights_days`, `exclusivity_days`) exist in the database and are captured in the wizard but have **zero server-side enforcement**. There is no budget pool accounting, no per-creator payment isolation, no usage rights expiration, and no exclusivity blocking. For launch with low volume, this is manageable (P1), but it becomes P0 as campaign volumes scale. The sponsorship checkout now has ownership validation, and the payout function has an idempotency key. All Section A P0 issues (public bucket flag, no reject path, no in-app refund) apply here.

---

## 2. IMPLEMENTATION STATE

| Component | State | Confidence |
|---|---|---|
| Sponsorship Checkout (brand pays restaurant) | **Built end-to-end** (with ownership validation) | High |
| Sponsorship webhook handling | **Built** (shares stripe-webhook handler) | High |
| Sponsorship payment verification | **Built end-to-end** (with email notifications) | High |
| Bilateral sponsorship completion | **Built end-to-end** (brand_completion_status + business_completion_status) | High |
| Sponsorship payout to restaurant | **Built end-to-end** (with idempotency key) | High |
| Brand campaign creation wizard | **Built** (BrandCampaignDetailsStep, ReviewStep) | High |
| Payment events ledger | **Built** (shares payment_events table) | High |
| per_creator_cap DB column | **Exists, NOT ENFORCED** | High |
| creator_count DB column | **Exists, NOT ENFORCED** | High |
| usage_rights_days DB column | **Exists, NOT ENFORCED** | High |
| exclusivity_days DB column | **Exists, NOT ENFORCED** | High |
| Budget pool accounting | **NOT BUILT** | High |
| Per-creator PaymentIntent isolation | **NOT BUILT** — uses same single-escrow model | High |
| Usage rights enforcement / expiration | **NOT BUILT** | High |
| Exclusivity enforcement | **NOT BUILT** | High |
| Brand spend dashboard | **Partially built** (BrandSponsorships, BrandAnalytics) | High |
| Per-creator delivery tracking | **NOT BUILT** — uses same collaboration model | High |
| Joint approval (brand + restaurant) | **Built** (dual approval columns on campaign_applications) | High |

---

## 3. FILE / TABLE / FUNCTION INVENTORY (Brand-Specific Additions)

### Edge Functions (Brand-Specific)
| Function | Purpose |
|---|---|
| `supabase/functions/create-sponsorship-checkout/index.ts` | Creates Stripe Checkout session for sponsorship payment (brand→restaurant). Validates caller is brand_id owner. Writes escrow_authorized payment event. |
| `supabase/functions/verify-sponsorship-payment/index.ts` | Verifies sponsorship payment post-redirect. Resolves cs_ to pi_ IDs. Sends email to both brand and restaurant. Writes sponsorship_paid event. |
| `supabase/functions/release-sponsorship-payout/index.ts` | Transfers sponsorship funds to restaurant on completion. Idempotency key: `sponsorship_payout_${sponsorshipId}`. Falls back to pending_balance via increment_pending_balance RPC. |

### Frontend Files (Brand-Specific)
| File | Purpose |
|---|---|
| `src/pages/BrandSponsorships.tsx` | Brand dashboard: manage sponsorships, payment status, completion, reviews, payment timeline |
| `src/pages/BusinessSponsorships.tsx` | Restaurant dashboard: view/accept/reject sponsorship proposals |
| `src/pages/BrandAnalytics.tsx` | Brand analytics: sponsorship counts, rejection rates |
| `src/pages/BrandCampaignDetails.tsx` | Brand campaign detail with deliverable tracking |
| `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx` | Wizard: per_creator_cap, usage_rights_days, exclusivity_days, creator_count |
| `src/components/brand-campaigns/BrandCampaignReviewStep.tsx` | Wizard review step with all brand fields displayed |
| `src/hooks/useSponsorshipPayment.ts` | Payment initiation + verification mutations |
| `src/hooks/useSponsorshipComplete.ts` | Bilateral completion with email notifications |
| `src/hooks/useBrandSponsorships.ts` | Fetch brand's sponsorship proposals |
| `src/hooks/useBrandSponsorshipStatus.ts` | Status checking for a specific sponsorship |

### Database Tables (Brand-Specific)
| Table | Key Columns |
|---|---|
| `campaign_sponsorships` | `brand_id`, `restaurant_id`, `campaign_id`, `sponsorship_amount`, `payment_status` (unpaid/pending/paid/refunded/failed), `payment_intent_id`, `payment_date`, `payment_method`, `status` (pending/accepted/rejected/active/completed/cancelled), `brand_completion_status` (pending/requested/approved), `business_completion_status` (pending/requested/approved), `completed_at`, `terms` (JSONB), `proposal_message` |
| `campaigns` (brand fields) | `campaign_type` ('business'/'brand'), `per_creator_cap` (numeric), `creator_count` (integer), `usage_rights_days` (integer), `exclusivity_days` (integer), `tagline`, `target_creator_personas` (text[]), `geographic_scope`, `hashtag_requirements` |
| `campaign_applications` (joint approval) | `brand_approval_status` (pending/approved/rejected), `restaurant_approval_status` (pending/approved/rejected), `final_approval_status` (pending/approved/rejected) |

### Migrations (Brand-Specific)
| Migration | Purpose |
|---|---|
| `20251001203644_...sql` | Creates `campaign_sponsorships` table |
| `20251002191100_...sql` | Adds payment_status, payment_intent_id, payment_date, payment_method to sponsorships; adds joint approval columns to campaign_applications |
| `20260406100000_brand_campaign_fields.sql` | Adds per_creator_cap, creator_count, usage_rights_days, exclusivity_days, tagline, target_creator_personas, geographic_scope, hashtag_requirements to campaigns |
| `20260406_brand_shortlists.sql` | Brand creator shortlists |

---

## 4. FLOW-BY-FLOW WALKTHROUGH (Deltas from Section A)

### B-FLOW 1: Brand Campaign Engages N Creators

**Current Code Path:**
- Brand creates campaign with `campaign_type='brand'`, sets `creator_count` and `per_creator_cap` in wizard
- Creators apply individually (same `campaign_applications` flow)
- Joint approval: brand sets `brand_approval_status`, restaurant sets `restaurant_approval_status`. `final_approval_status` is derived.
- Each accepted creator gets individual collaboration (`campaign_collaborations`)
- **ONE escrow payment per campaign**, not per creator

**Architecture:**
- Single escrow covers the campaign budget
- Individual creators paid via `release-creator-payout` from platform's Stripe balance
- `per_creator_cap` stored but **never checked server-side** when releasing payouts

**Failure Modes:**
- **P1: No per-creator payment isolation.** If 10 creators deliver, 10 separate transfers are made from the platform balance without checking against the original escrow amount.
- **P1: Over-payment risk** — if total payouts exceed escrow, platform pays from its own balance. Mitigated at low volume by manual approval pace.
- **P1: per_creator_cap not enforced** — DB column exists, wizard captures it, no edge function checks.

**Severity:** P1 (functional at low volume; becomes P0 at scale)

---

### B-FLOW 2: Budget Pool Accounting

**Current State: NOT BUILT.**

- No `budget_remaining` or `budget_spent` column on campaigns
- No running balance updated atomically as creators are paid
- No `FOR UPDATE` locks or atomic decrement
- `fixed_price` / `budget_max` is per-collaboration, not a pool total

**Race Condition Analysis:**
- Two concurrent approvals both call `release-creator-payout` independently
- Both succeed (transferring from platform balance)
- Total paid could exceed escrow collected
- **No blocking mechanism**

**Mitigation:** Currently approvals are manual one-at-a-time UI actions, making concurrent approval unlikely. But there's no server-side guard.

**Severity:** P1 at current volume (manual approvals prevent races); P0 at scale or if batch-approve is added

---

### B-FLOW 3: Required Deliverable Mix (3 Reels + 5 Stories + 1 Carousel)

**Current State:**
- `campaign_deliverables` table stores per-campaign requirements (content_type, platform, status)
- Defined at **campaign level**, NOT per-creator
- No allocation assigns mix slots to individual creators
- No validation that a creator's submission matches assigned types
- `campaign_deliverables.status` is independent from `campaign_collaborations.content_status`

**Severity:** P1 (deliverable mix captured but unlinked to creator submissions)

---

### B-FLOW 4: Per-Creator Approval

**Current State:**
- Each collaboration is independent — approving creator A does NOT affect creator B
- No shared pool counter updated on individual approvals
- No aggregate "5 of 10 delivered" view for the brand
- Partial-batch approvals NOT supported (whole-collaboration status only)
- Brand uses same `ContentApprovalPanel` / `QuickApprovalCard` as business flow

**Severity:** P2 (functional but poor UX for multi-creator campaigns)

---

### B-FLOW 5: Usage Rights Window (30 / 60 / 90 days, perpetual)

**Current State:**
- `campaigns.usage_rights_days` (INTEGER) — stored in DB
- Set in `BrandCampaignDetailsStep.tsx` (30/60/90/365 days or null for perpetual)
- Displayed in review step and campaign cards
- **NO enforcement:**
  - No scheduled function flips a flag after expiration
  - No notification to brand when window expires
  - No signed URL TTL tied to usage window
  - Content remains accessible forever after approval

**Severity:** P1 (selling usage rights without enforcement is a contractual promise the platform can't keep; legal liability)

---

### B-FLOW 6: Exclusivity (No Competitor Brands for X Days)

**Current State:**
- `campaigns.exclusivity_days` (INTEGER) — stored in DB
- Set in wizard (30/60/90 days or null)
- **NO enforcement:**
  - No check at campaign-acceptance blocks creator from accepting competing campaigns
  - No brand/industry tagging on business_profiles to identify competitors
  - No notification if creator accepts competing campaign
  - Creator may breach unknowingly

**Severity:** P1 (exclusivity is a paid premium feature with zero enforcement)

---

### B-FLOW 7: Brand-Side Payouts and Reporting

**Current State:**
- `BrandSponsorships.tsx`: Lists sponsorships with payment status (Paid/Pending/Unpaid), completion status, payment timeline per sponsorship
- Payment actions: "Pay" button → Stripe Checkout; "Verify Payment" button for pending
- `BrandAnalytics.tsx`: Total sponsorships, acceptance rates, rejection rates
- **No per-campaign spend breakdown** (total committed vs paid out vs remaining)
- **No per-creator delivery breakdown** in a single view
- PaymentTimeline component shows event history per sponsorship

**Severity:** P1 (brand can't manage multi-creator campaign spend effectively)

---

## 5. TRIAGED BUG LIST

### P0 — BLOCKS LAUNCH (Financial Exposure)

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P0-B1 | **All Section A P0 issues apply** — bucket public flag, no reject path, no in-app refund | See Section A | See Section A | — | — |

**Note:** The previous audit's P0-B1 (missing idempotency key on release-sponsorship-payout) and P0-B2 (missing ownership validation on create-sponsorship-checkout) have been **FIXED**:
- `release-sponsorship-payout/index.ts:107`: `idempotencyKey: 'sponsorship_payout_${sponsorshipId}'` ✅
- `create-sponsorship-checkout/index.ts:57-79`: Validates caller's business_profiles.id matches sponsorship.brand_id ✅

### P1 — SHOULD FIX BEFORE LAUNCH

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P1-B1 | **per_creator_cap not enforced server-side** — payout can exceed cap | `release-creator-payout/index.ts:88-95` | Add check: `creatorPayout <= campaign.per_creator_cap` before transfer. Reject with error if exceeded. | S | Individual creator overpayment |
| P1-B2 | **No budget pool accounting** — no running balance, no over-payment guard | N/A (missing) | Add `budget_spent` column; use Postgres function with `FOR UPDATE` to atomically increment on payout; reject if exceeds escrow | M | Platform pays from own balance if approvals exceed escrow |
| P1-B3 | **usage_rights_days not enforced** — field exists, no expiration logic | `20260406100000_brand_campaign_fields.sql:11` | Create scheduled function to mark expired usage rights; notify brand; optionally revoke signed URL access | M | Legal liability: content used beyond contractual window |
| P1-B4 | **exclusivity_days not enforced** — field exists, no blocking logic | `20260406100000_brand_campaign_fields.sql:12` | Add industry tagging; check at campaign-acceptance; block if conflict | L | Brand pays for exclusivity that isn't delivered |
| P1-B5 | **No deliverable mix assignment per creator** — campaign_deliverables not linked to collaborations | `20260403000000_campaign_media_deliverables.sql` | Create `collaboration_deliverables` join table | M | No tracking of which creator delivers which content types |
| P1-B6 | **No brand aggregate spend dashboard** — no total committed vs paid out vs remaining | `src/pages/BrandSponsorships.tsx` | Add summary stats at top: total committed, paid, remaining, creators engaged | M | Brand can't manage campaign financials |
| P1-B7 | **Sponsorship payout doesn't update sponsorship status** — release-sponsorship-payout transfers funds but doesn't update campaign_sponsorships.status | `release-sponsorship-payout/index.ts` | Add `.update({ status: 'completed' })` on campaign_sponsorships after successful transfer | S | Sponsorship shows old status after payout |
| P1-B8 | **All Section A P1 issues apply** (auto-approval timer, client-only revision limit, fee mismatch, no confirm dialog, ledger timing, business spend dashboard, Stripe API version, dispute evidence) | See Section A | See Section A | — | — |

### P2 — POST-LAUNCH

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P2-B1 | **No per-creator delivery breakdown for brand** — can't see who delivered what in one view | `src/pages/BrandCampaignDetails.tsx` | Add multi-creator progress view | M | Poor brand UX |
| P2-B2 | **No partial-batch approval** — can't approve 4 of 5 deliverables per creator | Content approval components | Link individual deliverable status to approval buttons | M | All-or-nothing is inflexible |
| P2-B3 | **creator_count not enforced** — no limit on accepted applications | Campaign application logic | Server-side check: count accepted apps, reject if >= creator_count | S | More creators accepted than budgeted |
| P2-B4 | **Content licensing as a DB integer** — no formal agreement document | Brand wizard | Generate downloadable usage rights agreement from campaign terms | M | No paper trail for licensing disputes |
| P2-B5 | **All Section A P2 issues apply** | See Section A | See Section A | — | — |

---

## 6. ROOT-CAUSE PATTERNS

### Pattern 1: Brand Fields Are Stored But Never Enforced
`per_creator_cap`, `creator_count`, `usage_rights_days`, `exclusivity_days` were added in `20260406100000_brand_campaign_fields.sql`. The wizard captures them, the review step displays them, but **zero server-side enforcement exists**. These are contractual obligations the platform promises but can't deliver. This is the single largest gap in the brand flow.

### Pattern 2: Single Escrow Doesn't Scale to Multi-Creator
The one-escrow-per-campaign model works for 1:1 relationships. For N-creator campaigns, the system needs either N individual escrows or atomic budget pool tracking. Neither exists. The fix is budget pool accounting — add a `budget_spent` column and use a Postgres function with `FOR UPDATE` to atomically increment on each payout.

### Pattern 3: Sponsorship Flow Has Improved But Diverges on Completion
The sponsorship completion flow (bilateral: brand_completion_status + business_completion_status) is different from the collaboration content approval flow (unilateral: business approves). The sponsorship payout (`release-sponsorship-payout`) goes to the restaurant, not the creator. This is correct but means the brand flow has TWO separate payment channels: (1) escrow → creator payout for content, and (2) sponsorship → restaurant payout for campaign sponsorship. Both should log to the same payment_events ledger, and they do.

---

## 7. OPEN QUESTIONS (Require Product Decision)

1. **Budget pool vs per-creator escrow:** Should brand campaigns collect one lump-sum and track a running balance, or should each creator acceptance trigger a separate checkout?
2. **Usage rights enforcement scope:** Should the platform actively revoke content access after the window, or just notify? Active revocation requires signed URL TTL management.
3. **Exclusivity enforcement approach:** How should "competitor" be defined? Industry tags? Self-declaration? Admin curation?
4. **Deliverable assignment model:** Assigned to specific creators at acceptance, or creators self-select?
5. **Multi-creator approval UX:** Batch-approve interface needed, or individual review always required?
6. **Sponsorship completion + payout coupling:** Should the payout be triggered automatically when both parties mark complete, or should it require an explicit "release payment" step?

---

## 8. POST-LAUNCH RECOMMENDATIONS (First 90 Days)

1. **Budget pool implementation** — atomic budget tracking for multi-creator campaigns (critical for scaling)
2. **Usage rights lifecycle** — scheduled function for expiration tracking + notifications
3. **Exclusivity engine** — industry tagging, conflict detection at application time
4. **Brand campaign analytics** — per-campaign dashboard: creator progress, spend breakdown, deliverable completion
5. **Deliverable assignment workflow** — link campaign_deliverables to specific collaborations
6. **Content licensing agreement generation** — formalize usage rights as downloadable PDF
7. **Sponsorship invoicing** — automated receipts for brand payments

---

## BUG / ISSUE CHECKLIST (Brand-Specific)

### PAYMENT INTEGRITY (Brand-Specific)
- [x] Sponsorship checkout ownership validation (brand_id check)
- [x] Sponsorship payout idempotency key (`sponsorship_payout_${sponsorshipId}`)
- [x] Sponsorship payout falls back to pending_balance via atomic RPC
- [x] Payment events written for all sponsorship state changes
- [ ] **ABSENT** — Budget pool accounting with atomic decrement (P1-B2)
- [ ] **ABSENT** — per_creator_cap server-side enforcement (P1-B1)
- [ ] **ABSENT** — Sponsorship status update on payout (P1-B7)

### BRAND CONTRACT ENFORCEMENT
- [ ] **ABSENT** — Usage rights expiration logic (P1-B3)
- [ ] **ABSENT** — Exclusivity blocking at campaign-acceptance time (P1-B4)
- [ ] **ABSENT** — Creator count enforcement (P2-B3)
- [ ] **ABSENT** — Deliverable mix assignment per creator (P1-B5)

### BRAND REPORTING
- [ ] **ABSENT** — Aggregate campaign spend tracking (P1-B6)
- [ ] **ABSENT** — Per-creator delivery breakdown (P2-B1)
- [ ] **ABSENT** — Partial-batch approval (P2-B2)

### PREVIOUSLY REPORTED P0s — NOW FIXED
- [x] ~~release-sponsorship-payout missing idempotency key~~ → FIXED (line 107)
- [x] ~~create-sponsorship-checkout lacks ownership validation~~ → FIXED (lines 57-79)
- [x] ~~No ledger/audit table~~ → FIXED (payment_events table, 20260408000000 migration)
- [x] ~~No webhook idempotency~~ → FIXED (stripe_webhook_events table)
- [x] ~~Missing charge.refunded webhook~~ → FIXED (stripe-webhook handles it)
- [x] ~~Missing charge.dispute.created webhook~~ → FIXED (stripe-webhook handles it)
- [x] ~~Missing transfer.failed webhook~~ → FIXED (transfer.updated with reversed check)
- [x] ~~Non-atomic pending_balance update~~ → FIXED (increment_pending_balance RPC)

### SHARED WITH SECTION A (All Apply to Brand Flow)
- See `delivery-payment-audit-business.md` full checklist — all items apply equally to brand flow.
