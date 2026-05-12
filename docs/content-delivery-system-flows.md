# DragonCandy Content Delivery System — Flow Documentation

> Complete reference for the content delivery lifecycle across all three roles:
> **Restaurant** (business owner), **Creator** (content creator), and **Brand** (sponsor).

---

## Roles Overview

| Role | Account Type | Dashboard Route | Purpose |
|------|-------------|-----------------|---------|
| Restaurant | `business_client` (restaurant) | `/dashboard/business` | Creates campaigns, reviews applications, approves content, releases payment |
| Creator | `content_creator` | `/dashboard/creator` | Browses campaigns, applies, delivers content, receives payment |
| Brand | `brand` | `/dashboard/brand` | Sponsors restaurant campaigns, co-approves creator applications |

---

## 1. Campaign Lifecycle

```
 ┌──────────┐     Pay Escrow      ┌───────────┐    Accept Creator    ┌─────────┐
 │  DRAFT   │ ──────────────────► │ PUBLISHED │ ──────────────────► │ ACTIVE  │
 └──────────┘  (fixed-price only) └───────────┘                     └─────────┘
                                       │                                 │
                                       │ Cancel                          │ All content
                                       ▼                                 │ delivered
                                  ┌───────────┐                          ▼
                                  │ CANCELLED │                     ┌───────────┐
                                  └───────────┘                     │ COMPLETED │
                                                                    └───────────┘
```

### Campaign Statuses

| Status | Description | Who triggers |
|--------|-------------|-------------|
| `draft` | Created but not published | Restaurant (auto on save) |
| `published` | Visible to creators, accepting applications | Restaurant (after escrow for fixed-price) |
| `active` | Creator accepted, content delivery in progress | System (on application acceptance + escrow held) |
| `completed` | All deliverables approved, payment released | System (on content approval or dual completion) |
| `cancelled` | Campaign cancelled | Restaurant |

### Escrow Statuses (`campaigns.escrow_status`)

| Status | Description |
|--------|-------------|
| `none` | No escrow (bid-range campaigns, or not yet initiated) |
| `pending` | Stripe Checkout created, payment not yet confirmed |
| `held` | Payment verified, funds held |
| `released` | Funds transferred to creator |

---

## 2. Application Flow

### Non-Sponsored Campaign (Restaurant Only)

```
Creator applies
      │
      ▼
  ┌─────────┐
  │ PENDING │
  └─────────┘
      │
      ├── Restaurant accepts ──► ACCEPTED ──► Collaboration created (if escrow held)
      │
      ├── Restaurant rejects ──► REJECTED
      │
      └── Restaurant counters ──► COUNTER_OFFERED ──► Creator responds ──► back to PENDING
```

**Restaurant actions** (on Campaign Details page → Applications tab):
- **Accept** — sets `status: 'accepted'`; if `escrow_status === 'held'`, auto-creates collaboration
- **Reject** — sets `status: 'rejected'`
- **Counter** — opens negotiation thread

### Sponsored Campaign (Joint Approval: Restaurant + Brand)

```
Creator applies
      │
      ▼
  ┌─────────────────────────────────────┐
  │  brand_approval_status: pending     │
  │  restaurant_approval_status: pending│
  │  final_approval_status: pending     │
  └─────────────────────────────────────┘
      │                    │
      │ Brand approves     │ Restaurant approves
      ▼                    ▼
  ┌──────────┐       ┌──────────────┐
  │ Brand:   │       │ Restaurant:  │
  │ approved │       │ approved     │
  └──────────┘       └──────────────┘
      │                    │
      └────── BOTH? ──────┘
               │
               ▼
    final_approval_status: approved
    status: accepted
    ──► Collaboration created
```

- If **either** party rejects → `final_approval_status: 'rejected'`, `status: 'rejected'`
- DB trigger `trg_recompute_final_approval` auto-syncs `final_approval_status`

**Restaurant sees**: JointApprovalCard on Campaign Details → Applications tab
**Brand sees**: JointApprovalCard on Brand Campaign Details page

---

## 3. Content Delivery Flow (Collaboration)

This is the core of the system — what happens after a creator is hired.

```
                                      ┌─────────────────┐
                                      │     PENDING      │ Creator hasn't started
                                      └────────┬────────┘
                                               │ Creator starts
                                               ▼
                                      ┌─────────────────┐
                                      │   IN_PROGRESS    │ Creator working
                                      └────────┬────────┘
                                               │ Creator submits
                                               ▼
                               ┌──────────────────────────────┐
                               │          SUBMITTED            │ Ready for review
                               │  (auto-approve timer starts)  │
                               └──────┬─────────┬──────┬──────┘
                                      │         │      │
                           Approves   │         │      │ Timer expires
                                      │         │      │
                                      ▼         │      ▼
                              ┌──────────┐      │  ┌───────────────┐
                              │ APPROVED │      │  │ AUTO_APPROVED │
                              └──────────┘      │  └───────────────┘
                                      │         │         │
                                      │         │         │
                          Payment released      │    Payment released
                                                │
                                     Requests revision
                                     (max 2 total)
                                                │
                                                ▼
                                     ┌────────────────────┐
                                     │ REVISION_REQUESTED  │ Creator makes changes
                                     └─────────┬──────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    │ Creator resubmits   │ All revisions used
                                    ▼                     │ + Restaurant rejects
                               SUBMITTED                  ▼
                               (loop back)           ┌──────────┐
                                                     │ REJECTED │
                                                     └────┬─────┘
                                                          │ auto
                                                          ▼
                                                     ┌──────────┐
                                                     │ DISPUTED │
                                                     └────┬─────┘
                                                          │ Admin resolves
                                                          ▼
                                                     ┌──────────┐
                                                     │ RESOLVED │
                                                     └──────────┘
                                                     (refund / partial / approved)
```

### Content Status Values

| Status | Description | Who triggers |
|--------|-------------|-------------|
| `pending` | Waiting for creator to start | System (on collaboration creation) |
| `in_progress` | Creator working on content | Creator |
| `submitted` | Content submitted for review | Creator |
| `revision_requested` | Business wants changes (max 2) | Restaurant |
| `approved` | Content approved, payment released | Restaurant |
| `auto_approved` | Review timer expired | Cron job |
| `rejected` | Rejected after all revisions exhausted | Restaurant (auto-transitions to disputed) |
| `disputed` | Under admin mediation | System |
| `resolved` | Dispute resolved | Admin |

### Auto-Approval Windows

| Delivery Type | Review Window | Extension |
|---------------|--------------|-----------|
| Standard | 48 hours | +24 hours |
| Expedited | 24 hours | +24 hours |
| DragonRush | 4 hours | +2 hours |

### Dispute Outcomes

| Outcome | What happens |
|---------|-------------|
| `refund` | Full refund to restaurant |
| `partial_payment` | Split payment (configurable) |
| `approved` | Full payout to creator, collaboration completed |

### Dual Completion (Alternative Path)

Either party can request project completion:
1. One party clicks "Mark Complete" → their `*_completion_status` = `'requested'`
2. Other party clicks "Approve Completion" → both set to `'approved'`
3. System: collaboration → `completed`, content → `approved`, payment released

---

## 4. Sponsorship Flow

```
Brand proposes sponsorship
         │
         ▼
    ┌─────────┐
    │ PENDING │
    └─────────┘
         │
         ├── Restaurant accepts ──────────────────────► ACCEPTED
         │                                                  │
         └── Restaurant rejects ──► REJECTED                │
                                                            │
                                              Brand pays sponsorship
                                              (payment_status: paid)
                                                            │
                                              Both mark complete
                                                            │
                                                            ▼
                                                      ┌───────────┐
                                                      │ COMPLETED │
                                                      └───────────┘
                                                      Payment released
                                                      to restaurant
```

### Sponsorship Statuses

| Status | Description |
|--------|-------------|
| `pending` | Brand proposed, waiting for restaurant |
| `accepted` | Restaurant accepted the proposal |
| `rejected` | Restaurant declined |
| `completed` | Both parties confirmed completion, payment released |

### Sponsorship Completion Handshake

| Field | Values |
|-------|--------|
| `brand_completion_status` | `null` → `'requested'` → `'approved'` |
| `business_completion_status` | `null` → `'requested'` → `'approved'` |

When both reach `'requested'`, system auto-sets both to `'approved'`, status to `'completed'`, and triggers `release-sponsorship-payout`.

---

## 5. Payment Flow

### Edge Functions

| Function | Trigger | Action |
|----------|---------|--------|
| `create-campaign-escrow` | Restaurant publishes fixed-price campaign | Creates Stripe Checkout session |
| `verify-campaign-escrow` | Return from Stripe Checkout | Verifies payment, sets escrow to `held`, publishes campaign |
| `release-creator-payout` | Content approved / auto-approved / dual completion | Transfers escrow to creator (Stripe Connect or pending balance) |
| `auto-approve-content` | Cron job | Finds expired review windows, auto-approves, triggers payout |
| `reject-content` | Restaurant rejects (revisions exhausted) | Transitions to disputed, creates dispute record |
| `resolve-dispute` | Admin action | Executes refund/partial/full-payout based on outcome |
| `release-sponsorship-payout` | Both parties confirm sponsorship completion | Transfers sponsorship amount to restaurant |

### Platform Fee

Calculated per-transaction via `getOrgTakeRate()`:

| Tier | Take Rate |
|------|-----------|
| Free | 10% |
| Starter ($149/mo) | 7% |
| Growth ($499/mo) | 5% |
| Pro ($999/mo) | 3% |
| Enterprise | 2% |

---

## 6. Pages by Role

### Restaurant (Business)

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard/business` | Overview, active campaigns, notifications |
| Campaigns List | `/dashboard/business/campaigns` | All campaigns with status filters |
| Campaign Details | `/dashboard/business/campaigns/:id` | **Primary workspace**: status banner, applications, content review, sponsorship card, payment |
| Campaign Creator | `/dashboard/business/campaigns/create` | Donny-powered campaign wizard |
| Edit Campaign | `/dashboard/business/campaigns/:id/edit` | Modify draft campaigns |
| Browse Creators | `/dashboard/business/creators` | Find and invite creators |
| Messages | `/dashboard/business/messages` | All conversations |
| Settings | `/dashboard/business/settings` | Stripe Connect, profile |

### Creator

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard/creator` | Overview, recent activity, deadlines |
| Browse Campaigns | `/dashboard/creator/campaigns` | Marketplace: discover and apply |
| Campaign Details | `/dashboard/creator/campaigns/:id` | View campaign brief, apply with Donny |
| My Campaigns | `/dashboard/creator/my-campaigns` | Applied / Active / Completed tabs |
| Campaign Detail | `/dashboard/creator/my-campaigns/:id` | Content submission, status tracking, messaging |
| Earnings | `/dashboard/creator/earnings` | Payment history, pending balance |
| Messages | `/dashboard/creator/messages` | All conversations |
| Settings | `/dashboard/creator/settings` | Stripe Connect onboarding, profile |

### Brand (Sponsor)

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard/brand` | Overview, sponsored campaigns |
| Discover Campaigns | `/dashboard/brand/discover-campaigns` | Browse campaigns open for sponsorship |
| Brand Campaign Details | `/dashboard/brand/campaigns/:id` | Propose sponsorship, co-approve creators, view status |
| Campaign Creator | `/dashboard/brand/campaigns/create` | Create brand-originated campaigns |
| Sponsorships | `/dashboard/brand/sponsorships` | All sponsorship proposals and their statuses |
| Browse Creators | `/dashboard/brand/creators` | Discover creators |
| Analytics | `/dashboard/brand/analytics` | Performance metrics |
| Messages | `/dashboard/brand/messages` | All conversations |
| Settings | `/dashboard/brand/settings` | Stripe Connect, profile |

---

## 7. End-to-End Scenario: Standard Campaign

```
 RESTAURANT                     CREATOR                        BRAND (if sponsored)
 ──────────                     ───────                        ──────────────────
 1. Create campaign
    (Donny wizard)
         │
 2. Pay escrow ─────────────────────────────────────────────── 2b. Propose sponsorship
    (Stripe Checkout)                                               │
         │                                                     Restaurant accepts
 3. Campaign published                                              │
         │                                                     Brand pays sponsorship
         │                      4. Browse campaigns
         │                         │
         │                      5. Apply (One-Tap w/ Donny)
         │                         │
 6. Review application ◄───────────┘
    (Accept / Reject / Counter)                                6b. Co-approve (if sponsored)
         │
 7. Creator accepted
    Collaboration created
         │                      8. Upload content
         │                         │
 9. Review content ◄───────────────┘
    ┌────┴────┐
    │         │
 Approve   Request revision (max 2)
    │         │
    │      Creator resubmits ──► back to step 9
    │
 10. Payment released ─────────► Creator receives payout
         │
 11. Leave review               11. Leave review
         │                                                     11b. Mark sponsorship complete
    COMPLETED                   COMPLETED                      COMPLETED
```

---

## 8. Key Components in the Delivery Flow

### Restaurant Sees

| Component | Where | Purpose |
|-----------|-------|---------|
| `CampaignStatusBanner` | Campaign Details | Contextual guidance + primary action button |
| `ApplicationsListFixed` | Campaign Details (pre-hire) | Review all applications with filters |
| `JointApprovalCard` | Application card (if sponsored) | Dual approval UI |
| `ContentApprovalPanel` | Project Details | Approve / Request Revision / Reject |
| `ReviewCountdownTimer` | Content review | Shows auto-approval countdown |
| `SponsorshipCard` | Campaign Details sidebar | Brand sponsor info + completion |
| `ProgressTimeline` | Campaign Details | Visual step tracker |

### Creator Sees

| Component | Where | Purpose |
|-----------|-------|---------|
| `CreatorCampaignDetails` | Campaign Details | Full campaign brief |
| `OneTapApplySheet` | Campaign Details | Donny-powered quick apply |
| `CreatorContentSubmit` | My Campaign Detail | Upload and submit deliverables |
| `DisputeStatusBanner` | Project view | Dispute status and context |
| `StickyApplyCTA` | Campaign Details | Persistent apply button |

### Brand Sees

| Component | Where | Purpose |
|-----------|-------|---------|
| `SponsorshipProposalModal` | Brand Campaign Details | Submit sponsorship proposal |
| `SponsorshipStatusCard` | Brand Campaign Details | Proposal status + payment |
| `JointApprovalCard` | Brand Campaign Details | Co-approve creator applications |
| `SponsorshipAmplificationPrompt` | Brand Campaign Details | Post-acceptance amplification |

---

*Last updated: 2026-05-12*
*Generated from codebase audit of routes, hooks, edge functions, and state machine migrations.*
