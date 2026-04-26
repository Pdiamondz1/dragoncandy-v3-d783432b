# Campaign-to-Content Delivery: Plumbing Fixes

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Fix P0/P1 gaps in the campaign-to-content delivery flow before UX overhaul
**Approach:** State machine first, then targeted fixes on top

---

## Context

The campaign-to-content delivery flow between restaurants/businesses and creators is substantially built but has documented gaps that break the end-to-end experience. This spec covers the foundational plumbing fixes. A follow-up UX spec will address campaign creation UX (less typing, URL-based creation, Donny AI assistance) for mobile and desktop.

## 1. Collaboration State Machine

Single source of truth for valid content status transitions on `campaign_collaborations.content_status`.

### States

| State | Description |
|---|---|
| `pending` | Collaboration created, creator hasn't started |
| `in_progress` | Creator clicked "Start Content", deadline set |
| `submitted` | Creator uploaded files and submitted for review |
| `revision_requested` | Restaurant requested changes (max 2 revisions) |
| `approved` | Restaurant manually approved content |
| `auto_approved` | Auto-approval timer expired, treated same as approved |
| `rejected` | Restaurant rejected after 2 failed revisions |
| `disputed` | Rejection triggered dispute/mediation flow |
| `resolved` | Dispute resolved with outcome |

### Valid Transitions

```
pending → in_progress
in_progress → submitted
submitted → approved
submitted → revision_requested
submitted → auto_approved
revision_requested → submitted (revision_count incremented)
revision_requested → rejected (only when revision_count >= 2)
rejected → disputed (automatic)
disputed → resolved
```

Terminal states: `approved`, `auto_approved`, `resolved`.

### Enforcement

- Postgres function `transition_content_status(collaboration_id, new_status)` validates the transition is legal before applying it
- All status changes go through this function — no direct column updates from the frontend
- The function also enforces revision_count < 2 before allowing `revision_requested`, and revision_count >= 2 before allowing `rejected`
- Invalid transitions return an error with the current state and attempted state

### Database Changes

Add to `campaign_collaborations`:
- `submitted_at` (timestamptz, nullable) — set on submission, reset on resubmission
- `review_extended` (boolean, default false) — tracks whether restaurant used their one extension
- `dispute_reason` (text, nullable) — restaurant's explanation for rejection
- `dispute_outcome` (enum: `refund`, `partial_payment`, `approved`, nullable) — resolution

New enum values for `content_status`: `auto_approved`, `rejected`, `disputed`, `resolved`.

---

## 2. Content Reject + Dispute Flow

### When Rejection Is Allowed

- Only after `revision_count >= 2` (creator has had 2 chances to revise)
- Restaurant must provide a `dispute_reason` (required text field)

### Dispute Table

New table `content_disputes`:

| Column | Type | Description |
|---|---|---|
| `id` | uuid, PK | |
| `collaboration_id` | uuid, FK | References campaign_collaborations |
| `initiated_by` | uuid, FK | References profiles (restaurant user) |
| `reason` | text, not null | Restaurant's rejection reason |
| `status` | enum: `open`, `resolved` | |
| `outcome` | enum: `refund`, `partial_payment`, `approved`, nullable | |
| `resolved_by` | uuid, FK, nullable | Admin/support who resolved |
| `resolved_at` | timestamptz, nullable | |
| `notes` | text, nullable | Resolution notes |
| `created_at` | timestamptz | |

RLS: participants of the collaboration + admin can read. Only admin can update status/outcome.

### Edge Function: `reject-content`

1. Validate caller is restaurant owner of the collaboration
2. Validate `revision_count >= 2` via `transition_content_status`
3. Set `content_status = 'rejected'`, store `dispute_reason`
4. Transition to `disputed` (automatic)
5. Create `content_disputes` row with status `open`
6. Send notification to both parties
7. Create conversation between parties if one doesn't exist
8. Write `content_rejected` and `dispute_opened` payment events

### Edge Function: `resolve-dispute`

1. Validate caller has admin/support role
2. Set dispute outcome and resolution notes
3. Transition `content_status = 'resolved'`, store `dispute_outcome`
4. Based on outcome:
   - `refund`: Stripe refund on escrow payment intent, decrement `budget_spent`
   - `partial_payment`: 50/50 split — refund 50% to restaurant, pay 50% to creator (admin can override the split percentage in `notes` field before resolving)
   - `approved`: call `release-creator-payout`
5. Write `dispute_resolved` payment event

### UI: Restaurant Side

- After 2 revisions, "Request Revision" button becomes "Reject Content"
- Reject opens modal: "Please explain why this content doesn't meet the brief" (required text, min 20 characters)
- After rejection, project card shows "Disputed — Awaiting Resolution" status badge

### UI: Creator Side

- "Content Disputed" status with restaurant's reason displayed
- Link to conversation thread
- Status badge updates on resolution

---

## 3. Auto-Approval Timer + Extension

### Thresholds

| Delivery Tier | Base Review Window | Extension |
|---|---|---|
| Standard | 48 hours | +24 hours |
| Express | 24 hours | +24 hours |
| DragonDash | 4 hours | +2 hours |

### Database Changes

- `submitted_at` on `campaign_collaborations` — set when creator submits, reset on resubmission after revision
- `review_extended` (boolean) — one extension allowed per submission

### Auto-Approval Calculation

```
deadline = submitted_at + base_threshold + (extension if review_extended)
```

The `auto-approve-content` cron function uses `submitted_at` (not `created_at`) and checks `review_extended` to compute the correct deadline.

### Countdown Timer UI (Restaurant Project View)

- Prominent banner at top of content review panel: "You have **X hours Y minutes** to review this content"
- Color: green (>50% remaining) → yellow (25–50%) → red (<25%)
- Subtext: "Content will be auto-approved and payment released when the timer expires"
- "Need more time?" button — adds extension, disabled after one use with tooltip "Extension already used"
- Extension writes `review_extended` payment event

### Notifications

| Trigger | Recipient | Message |
|---|---|---|
| Content submitted | Restaurant | "New content submitted — you have Xh to review" |
| 50% time remaining | Restaurant | "Reminder: Xh left to review [campaign] content" |
| 25% time remaining | Restaurant | "Urgent: Xh left before auto-approval on [campaign]" |
| Auto-approved | Both | "Content auto-approved, payment released" |
| Extension used | Creator | "[Restaurant] requested more review time — new deadline: [date]" |

---

## 4. Platform Fee Visibility

### Fee Structure

- 5% platform fee deducted from creator's payout (restaurant pays the full amount, creator receives 95%)
- Constant: `PLATFORM_FEE_RATE = 0.05` extracted into shared constant used by all edge functions

### Edge Functions to Update

1. `create-campaign-escrow` — use `PLATFORM_FEE_RATE` constant
2. `release-creator-payout` — use `PLATFORM_FEE_RATE` constant
3. `create-sponsorship-checkout` — use `PLATFORM_FEE_RATE` constant
4. `release-sponsorship-payout` — use `PLATFORM_FEE_RATE` constant

### Restaurant UI (Campaign Wizard Finalize Step + Checkout)

Fee breakdown card:
- Content budget: $X
- Delivery fee (tier): $Y
- **Total you pay: $X + $Y**

No mention of platform fee — it's not the restaurant's cost.

### Creator UI (Earnings Page + Project Details)

Fee breakdown:
- Campaign value: $X
- DragonCandy fee (5%): -$Y
- **Your payout: $X - $Y**

### Payment Timeline

Surface `platform_fee` from payment event metadata as a line item in the `PaymentTimeline` component for both parties.

---

## 5. Brand Budget Enforcement

### Database Changes

Add to `campaigns`:
- `budget_spent` (numeric, default 0) — total committed across accepted creators

### Postgres RPC

- `increment_budget_spent(campaign_id, amount)` — atomic increment, same pattern as existing `increment_pending_balance`
- `decrement_budget_spent(campaign_id, amount)` — for cancellation/refund scenarios

### Server-Side Validation (in `verify-campaign-escrow`)

When escrow is verified and collaboration is about to be created:

1. `proposed_rate <= per_creator_cap` (if set) — reject if exceeded
2. `budget_spent + proposed_rate <= budget_max` (pool check) — reject if exceeded
3. `active_collaboration_count < creator_count` (if set) — reject if full
4. On failure: refund Stripe payment, do not create collaboration, return specific error

On success: call `increment_budget_spent(campaign_id, proposed_rate)`.

On collaboration cancellation or dispute refund: call `decrement_budget_spent`.

### UI: Brand Campaign Dashboard

- Budget progress bar: "$1,200 of $2,000 committed (3 of 5 creators)"
- Application review warning: "Accepting at $500 would exceed remaining budget of $300"
- Disable accept button when budget exhausted or creator count full

### Not In Scope (Deferred to UX Spec)

- Usage rights expiration enforcement
- Exclusivity blocking across concurrent campaigns
- Per-creator payment isolation (separate escrow per creator)

---

## 6. Joint Approval Flow (Three-Party)

### Approval Logic

```
brand_approval_status:      pending | approved | rejected
restaurant_approval_status: pending | approved | rejected
final_approval_status:      pending | approved | rejected

Rules:
- final = approved   ONLY when brand = approved AND restaurant = approved
- final = rejected   when EITHER brand = rejected OR restaurant = rejected
- final = pending    otherwise
```

### Database Enforcement

Postgres trigger on `campaign_applications`: whenever `brand_approval_status` or `restaurant_approval_status` is updated, recompute `final_approval_status` automatically. No direct writes to `final_approval_status` from the frontend.

### Determining When Joint Approval Applies

Joint approval applies when a campaign has an associated `campaign_sponsorships` row (brand is sponsoring). Otherwise, only restaurant approval is needed and `final_approval_status` mirrors `restaurant_approval_status`.

### Edge Function Updates

- Brand approve/reject → sets `brand_approval_status`, trigger handles `final_approval_status`
- Restaurant approve/reject → sets `restaurant_approval_status`, trigger handles `final_approval_status`
- When `final_approval_status` = `approved` → proceed to escrow payment
- When `final_approval_status` = `rejected` → notify creator: "Your application was not selected"

### UI: Brand View

- Approval toggle for their decision
- Restaurant status badge: "Restaurant: Approved / Pending / Rejected"
- "Waiting on restaurant approval" banner when brand has approved but restaurant hasn't

### UI: Restaurant View

- Approval toggle for their decision
- Brand status badge: "Brand: Approved / Pending / Rejected"
- "Waiting on brand approval" banner when restaurant has approved but brand hasn't

### UI: Creator View

- "Application under review" until `final_approval_status` resolves
- On approval: "You've been accepted! Payment is being processed"
- On rejection: "Your application was not selected for this campaign"

### Notifications

| Trigger | Recipient | Message |
|---|---|---|
| One party approves | Other party | "Your approval needed for [creator] on [campaign]" |
| Both approve | Creator | "You've been accepted for [campaign]!" |
| Either rejects | Creator | "Your application was not selected" |

---

## 7. File Access Tightening

### Access Rules by Content Status

| Content Status | Restaurant | Creator |
|---|---|---|
| `pending` / `in_progress` | No access | Upload + view own |
| `submitted` | Preview only (15min signed URL) | View own |
| `revision_requested` | Preview only | View + re-upload |
| `approved` / `auto_approved` | Full download (1h signed URL) | Full download |
| `rejected` / `disputed` | Preview only | View own |
| `resolved` (approved) | Full download | Full download |
| `resolved` (refund) | No access | View own |

### Edge Function Changes (`get-watermarked-preview`)

- Validate `content_status` against access matrix before returning URL
- Preview URLs: 15-minute expiry, no `Content-Disposition` header (renders in browser)
- Download URLs: 1-hour expiry, `Content-Disposition: attachment` header
- Validate requesting user is a collaboration participant (creator, restaurant owner, or brand owner for sponsored campaigns)
- Log all access to `payment_events` as `file_accessed` event

### Storage Bucket Changes

- Set `campaign-deliverables` bucket to `public=false`
- Add RLS: only `service_role` can SELECT (edge function uses service role client)
- All user access goes through signed URLs from the edge function

### UI Changes

- `ProtectedFilePreview`: "Preview Only" badge on unapproved content
- Download button only visible when `content_status` is `approved`, `auto_approved`, or `resolved(approved)`
- Disable right-click context menu on preview images

---

## Implementation Order

1. **State machine** — Postgres function + enum additions (foundation for everything else)
2. **File access tightening** — bucket policy + edge function updates (quick security win)
3. **Platform fee visibility** — constant extraction + UI components (low risk, high visibility)
4. **Auto-approval timer** — `submitted_at` column + countdown UI + cron update
5. **Joint approval trigger** — Postgres trigger + UI for brand/restaurant views
6. **Content reject + dispute** — new table + edge functions + UI (largest piece)
7. **Brand budget enforcement** — RPC functions + validation in escrow verification

Items 1–3 can be developed in parallel. Items 4–7 depend on the state machine (item 1).

---

## Out of Scope (Deferred to UX Spec)

- Campaign creation UX overhaul (less typing, URL-based, Donny AI assistance)
- Usage rights expiration enforcement
- Exclusivity blocking
- Per-creator payment isolation
- Server-side image watermarking
- Donny AI mediation for disputes
- Mobile/desktop responsive redesign
