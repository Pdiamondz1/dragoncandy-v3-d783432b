# Delivery & Payment Audit: Business/Restaurant <> Creator Flow

**Date:** 2026-04-07 (Updated)
**Phase:** 1 of 2 (Read-Only Audit)
**Scope:** Section A — Business/Restaurant to Creator content delivery and payment pipeline

---

## 1. EXECUTIVE SUMMARY

The Business/Restaurant <> Creator payment flow is **substantially built and approaching launch-readiness, but has several P0/P1 gaps that must be addressed before real money flows**. Core infrastructure is solid: Stripe Checkout for escrow collection, webhook handling with signature verification AND idempotency via `stripe_webhook_events` table, Stripe Connect Express onboarding for both creators and restaurants, transfer-based payouts with idempotency keys, an append-only `payment_events` ledger, atomic `pending_balance` updates via Postgres RPC, a content approval workflow with revision limits, CSS-overlay watermarks on previews, and access-gated file previews via the `get-watermarked-preview` edge function. The storage bucket `campaign-deliverables` was originally PUBLIC but the SELECT policy has been tightened to collaboration participants (creator or campaign owner). **The remaining P0 gaps are: no REJECT path (business cannot reject content and trigger a refund), no auto-approval timer (creator waits indefinitely), and the platform fee is 5% vs the 15-20% spec. Step 8C is ~80% built** — watermarked previews use a CSS overlay (not server-side image manipulation), but the edge function properly gates downloads to approved-only status.

---

## 2. IMPLEMENTATION STATE

| Component | State | Confidence |
|---|---|---|
| Stripe Checkout (escrow collection) | **Built end-to-end** | High |
| Webhook handler (stripe-webhook) | **Built, comprehensive coverage** | High |
| Webhook idempotency (stripe_webhook_events) | **Built end-to-end** | High |
| Payment events ledger (payment_events) | **Built end-to-end** | High |
| Creator Connect onboarding | **Built end-to-end** | High |
| Restaurant Connect onboarding | **Built end-to-end** | High |
| Payout transfer to creator | **Built end-to-end** (with idempotency key) | High |
| Pending balance (atomic RPC) | **Built end-to-end** | High |
| Withdraw pending balance | **Built end-to-end** (with race guard) | High |
| Content submission workflow | **Built end-to-end** | High |
| Content approval (approve/revise) | **Built, missing reject** | High |
| DragonDash timer (start/countdown) | **Built end-to-end** | High |
| Creator earnings dashboard | **Built end-to-end** | High |
| Payments page (timeline/summary) | **Built end-to-end** | High |
| Protected file preview (watermark overlay) | **Built (CSS overlay, not server-side)** | High |
| Access-gated file download | **Built** (get-watermarked-preview edge function) | High |
| Auto-approval timer | **NOT BUILT** | High |
| Content REJECT path | **NOT BUILT** | High |
| Refund flow (business-initiated) | **NOT BUILT** | High |
| Business spend dashboard | **Partially built** (per-project only, no aggregate) | High |
| DragonDash rush premium split | **Built** — delivery_fee goes to creator minus 5% | Medium |
| Tax / 1099 handling | **Deferred to Stripe Connect Express** | Medium |

---

## 3. FILE / TABLE / FUNCTION / BUCKET INVENTORY

### Edge Functions
| Function | Purpose |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Handles: checkout.session.completed, payment_intent.payment_failed, checkout.session.expired, account.updated, charge.refunded, charge.dispute.created, transfer.updated |
| `supabase/functions/create-campaign-escrow/index.ts` | Creates Stripe Checkout session for campaign escrow payment |
| `supabase/functions/verify-campaign-escrow/index.ts` | Verifies escrow payment, publishes campaign, creates collaboration |
| `supabase/functions/release-creator-payout/index.ts` | Transfers funds to creator on content approval (or adds to pending_balance via RPC) |
| `supabase/functions/withdraw-pending-balance/index.ts` | Withdraws pending balance to connected account (with atomic race guard) |
| `supabase/functions/create-creator-connect-account/index.ts` | Creates Stripe Express connected account for creators |
| `supabase/functions/create-restaurant-connect-account/index.ts` | Creates Stripe Express connected account for restaurants |
| `supabase/functions/check-creator-payout-status/index.ts` | Returns creator Stripe account status and balances |
| `supabase/functions/check-restaurant-payout-status/index.ts` | Returns restaurant Stripe account status and balances |
| `supabase/functions/get-stripe-dashboard-link/index.ts` | Generates Stripe Express dashboard login link |
| `supabase/functions/get-watermarked-preview/index.ts` | Returns signed URLs with access control (approved=download, unapproved=preview only) |
| `supabase/functions/_shared/payment-events.ts` | Shared helper: writePaymentEvent() to append-only ledger |

### Frontend Files
| File | Purpose |
|---|---|
| `src/pages/ProjectDetailsPage.tsx` | Single project detail: content submission/approval workflow, payment timeline, DragonDash timer |
| `src/pages/CreatorEarnings.tsx` | Creator earnings dashboard: balance cards, payment history, Stripe setup, withdraw |
| `src/pages/PaymentsPage.tsx` | Unified payments page: active/completed/issues tabs with timeline per entity |
| `src/pages/BusinessProjects.tsx` | Business project list with content review queue |
| `src/components/projects/ContentApprovalPanel.tsx` | Business content review: approve & release payment, request revision (max 2) |
| `src/components/projects/CreatorContentSubmit.tsx` | Creator content submission with status tracking |
| `src/components/projects/QuickApprovalCard.tsx` | One-tap approval card with revision support |
| `src/components/projects/ProtectedFilePreview.tsx` | File preview with CSS watermark overlay, download gating |
| `src/components/projects/DragonDashTimer.tsx` | Countdown timer for expedited/dragonrush deliveries |
| `src/components/projects/StartContentButton.tsx` | Starts content creation timer |
| `src/components/projects/ProjectFileUpload.tsx` | File upload to campaign-deliverables bucket |
| `src/components/projects/CreatorPayoutBanner.tsx` | Creator Stripe onboarding status banner |
| `src/components/payments/PaymentTimeline.tsx` | Visual payment event timeline component |
| `src/components/payments/PaymentSummaryCards.tsx` | Summary cards for payment totals |
| `src/components/business-profile/RestaurantPaymentSettings.tsx` | Restaurant Stripe account settings and withdrawal |
| `src/hooks/usePaymentTimeline.ts` | React Query hook for payment_events |
| `src/hooks/usePaymentNotifications.ts` | Toast notifications for payment events from other party |
| `src/hooks/useDragonDashTimer.ts` | Timer logic: start, countdown, deadline calculation |
| `src/hooks/useCollaboration.ts` | Fetch collaboration details |
| `src/lib/paymentEducation.ts` | Payment event label/description mapping for UI |

### Database Tables (Payment-Related)
| Table | Key Columns |
|---|---|
| `payment_events` | `id`, `event_type`, `entity_type` (collaboration/sponsorship), `entity_id`, `campaign_id`, `actor_id`, `actor_role`, `amount_cents`, `currency`, `stripe_id`, `metadata` (JSONB), `created_at` — **APPEND-ONLY, RLS-gated to participants** |
| `stripe_webhook_events` | `event_id` (PK), `event_type`, `processed_at`, `status` (processing/processed/failed), `error_message` — **Service-role only, no public access** |
| `campaigns` | `escrow_status` (none/pending/held/released/refunded), `escrow_payment_intent_id`, `delivery_fee`, `delivery_type`, `fixed_price`, `pricing_type`, `budget_min`, `budget_max` |
| `campaign_collaborations` | `content_status` (pending/in_progress/submitted/revision_requested/approved), `revision_count`, `content_started_at`, `content_deadline`, `business_completion_status`, `creator_completion_status`, `completed_at` |
| `creator_profiles` | `stripe_account_id`, `stripe_onboarding_complete`, `pending_balance` |
| `business_profiles` | `stripe_account_id`, `stripe_onboarding_complete`, `pending_balance` |

### Storage Buckets
| Bucket | Public? | Notes |
|---|---|---|
| `campaign-deliverables` | **YES (public flag)** but **SELECT policy restricted** to: file owner (user_id matches folder) OR campaign owner (via file_uploads join). The `20260408000000_payment_safety.sql` migration replaced the permissive SELECT policy. |

### Environment Variables (All Referenced via Deno.env.get, Never Hardcoded)
- `STRIPE_SECRET_KEY` — all payment edge functions
- `STRIPE_WEBHOOK_SECRET` — stripe-webhook only
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — all edge functions
- No `sk_live_*` or `pk_live_*` found in codebase. VITE_STRIPE_PUBLISHABLE_KEY in CLAUDE.md is `pk_test_*`.

### Postgres RPCs
| Function | Purpose |
|---|---|
| `insert_payment_event` | Client-safe payment event insert (whitelisted types: content_started, content_submitted, revision_requested, content_resubmitted) with collaboration participant auth check |
| `increment_pending_balance` | Atomic `pending_balance += amount` (service_role only, NULL-safe) |

---

## 4. FLOW-BY-FLOW WALKTHROUGH

### A-FLOW 1: Creator Accepts Campaign / Commits to Delivery

**Current Code Path:**
1. Creator applies to campaign → `campaign_applications` row (status='pending')
2. Business accepts application via `useManageApplication.ts` → `status='accepted'`
3. Business prompted to pay escrow → `create-campaign-escrow` creates Stripe Checkout session (mode='payment', auto-capture)
4. Metadata includes `type: 'campaign_escrow'`, `campaign_id`, `user_id`
5. On payment → webhook `checkout.session.completed` → `escrow_status='held'`, `status='published'`
6. Business redirected → `verify-campaign-escrow` verifies payment, creates `campaign_collaborations` row (`status='active'`, `content_status='pending'`)
7. `writePaymentEvent` called for both escrow_authorized and escrow_held events

**Key Design Choice:** Uses Checkout Sessions with auto-capture (NOT manual capture). The "escrow" is simulated: platform collects funds into its own Stripe balance, then transfers to creators later. This means the platform is the counterparty holding customer funds.

**Failure Modes:**
- If webhook fires but DB update fails → returns 500 → Stripe retries. **Idempotent via stripe_webhook_events.** Good.
- If browser closes after payment → webhook handles it independently. Good.
- `verify-campaign-escrow` has 3-priority fallback: (1) sessionId from URL, (2) stored escrow_payment_intent_id, (3) Stripe metadata search. Robust.
- Content deadline NOT set on collaboration creation (set only when creator clicks "Start Content" via `useDragonDashTimer`).

**Severity:** P2 (auto-capture model is functional; deadline-on-start is by design)

---

### A-FLOW 2: Creator Uploads Delivered Content

**Current Code Path:**
1. Creator uploads files via `ProjectFileUpload` → `campaign-deliverables` bucket, path: `{userId}/{timestamp}-{random}.{ext}`
2. `file_uploads` row created with metadata
3. Creator clicks "Submit for Review" in `CreatorContentSubmit.tsx` → sets `content_status='submitted'`
4. `insert_payment_event` RPC called (content_submitted event)
5. Message sent to business owner notifying of submission

**Content Security:**
- **Bucket is marked public=true at creation** (`20250618155000` migration: `INSERT INTO storage.buckets ... public: true`)
- **BUT the SELECT policy was replaced** by `20260408000000_payment_safety.sql`: now restricted to file owner (auth.uid matches folder) OR campaign owner (via file_uploads + campaigns join)
- **REMAINING GAP:** The bucket's `public` flag being `true` means Supabase may serve objects without RLS if accessed via the public URL endpoint (`/storage/v1/object/public/campaign-deliverables/...`). The RLS policy only applies to authenticated API calls. **If someone constructs the public URL directly, the file is accessible without auth.** This is a P0 — the bucket must be set to `public: false`.
- `ProtectedFilePreview.tsx` implements CSS watermark overlay for images/videos (diagonal "PREVIEW ONLY — DRAGONCANDY" text repeated 12x, 20% opacity). Right-click disabled for business users pre-approval.
- `get-watermarked-preview` edge function checks collaboration membership and content_status before issuing signed URL. Returns `can_download: true` only if approved or if requester is the creator.
- Signed URLs have 3600s (1 hour) TTL. Good.

**Failure Modes:**
- **P0: Bucket `public: true` allows direct URL access bypassing RLS.** Must flip to `public: false`.
- CSS watermarks are trivially bypassable (browser dev tools, screenshots, screen recording). Not a real watermark — no pixel-level embedding. Acceptable for v1 if bucket is private.
- No separate watermarked file stored; overlay is client-side only.

**Severity:** P0 (bucket public flag), P2 (CSS vs server-side watermark)

---

### A-FLOW 3: Business Reviews Submission (Accept / Revise / REJECT?)

**Current Code Path:**
1. Business sees submissions in `BusinessProjects.tsx` → navigates to `ProjectDetailsPage`
2. `ContentApprovalPanel.tsx` shows when `content_status='submitted'`:
   - **"Approve & Release Payment"** → calls `release-creator-payout` edge function
   - **"Request Revision"** → sets `content_status='revision_requested'`, increments `revision_count`, sends message with feedback, writes `revision_requested` payment event via RPC
3. Revision limit: `MAX_REVISIONS = 2` in `ContentApprovalPanel.tsx:30`. After 2, only approve button shown.
4. Revision feedback is required (textarea must have content).
5. `QuickApprovalCard.tsx` provides same functionality in a compact card format.

**Three-Button State Machine:**
- APPROVE → `content_status='approved'` (via release-creator-payout) ✅
- REVISE → `content_status='revision_requested'` ✅
- **REJECT → DOES NOT EXIST** ❌

**Failure Modes:**
- **P0: No REJECT path.** Business can only approve or request revisions. After 2 revisions, only approve remains. If content is unacceptable, business has no recourse. This drives chargebacks.
- **P1: Revision limit is client-side only.** `MAX_REVISIONS = 2` is enforced in React components. The `campaign_collaborations` table has no CHECK constraint on `revision_count`. A direct Supabase API call could increment indefinitely. The `insert_payment_event` RPC does NOT check revision_count.
- **P1: No auto-approval timer.** If business doesn't respond, creator waits forever. No scheduled function exists to auto-approve.
- **P1: No confirmation dialog on approve.** Clicking "Approve & Release Payment" immediately triggers the payout. No "Are you sure?" modal. This is an irreversible financial action.

**Severity:** P0 (no reject/refund), P1 (no auto-approval, client-only revision limit, no confirm dialog)

---

### A-FLOW 4: Approval Triggers Transfer + Payout

**Current Code Path** (`release-creator-payout/index.ts`):
1. Verifies caller is campaign owner (line 65)
2. Gets creator's Stripe account from `creator_profiles`
3. Calculates: `payoutAmount = (fixed_price OR budget_max) + delivery_fee`; `platformFee = payoutAmount * 0.05`; `creatorPayout = payoutAmount - platformFee`
4. **If creator has Stripe account + onboarding complete:**
   - `stripe.transfers.create()` with idempotency key `payout_${collaborationId}` (line 128)
   - Writes 3 payment events: `content_approved`, `payment_released`, `transfer_created`
   - Updates `campaign_collaborations.status='completed'`, `content_status='approved'`
   - Updates `campaigns.escrow_status='released'`
5. **If creator NOT onboarded:**
   - Calls `increment_pending_balance` RPC (atomic, NULL-safe)
   - Writes 2 payment events: `content_approved`, `payout_pending_wallet`
   - Same status updates

**Ledger Pattern:** Payment events are written AFTER the Stripe transfer, not before. If the transfer succeeds but `writePaymentEvent` fails, the event is lost (but `writePaymentEvent` is fire-and-forget, catches errors internally). If the transfer succeeds but DB status updates fail, the function throws — the collaboration is inconsistent but the idempotency key prevents a retry from double-transferring.

**Failure Modes:**
- **P1: Ledger write is AFTER Stripe call, not before.** The recommended pattern is write-then-call. However, `writePaymentEvent` is fire-and-forget (won't throw), so the risk is a missing ledger entry, not a functional failure. Reconciliation cron needed.
- **P1: Fee is 5%, spec says 15-20%.** Hardcoded as `0.05` in line 102. Same in `create-campaign-escrow` (line 97). Product decision needed.
- **P2: Payout amount uses `budget_max` as fallback** (line 94). If pricing is `bid_range`, this may not reflect the actual agreed price. Should use the accepted application's bid amount if available.
- Transfer uses separate Transfer API (not `transfer_data` on PaymentIntent). Consistent across codebase.

**Severity:** P1 (ledger timing, fee mismatch), P2 (payout amount source)

---

### A-FLOW 5: Webhook Handlers (Stripe → DragonCandy)

**Current Coverage** (`stripe-webhook/index.ts`):

| Event | Handled | Action |
|---|---|---|
| `checkout.session.completed` | ✅ | Updates escrow_status='held' OR sponsorship payment_status='paid'; writes payment event |
| `payment_intent.payment_failed` | ✅ | Resets escrow_status to 'none' (conditional on 'pending'); writes escrow_failed event |
| `checkout.session.expired` | ✅ | Same reset as failed; writes escrow_expired event |
| `account.updated` | ✅ | Syncs stripe_onboarding_complete to creator/business profiles |
| `charge.refunded` | ✅ | Sets escrow_status='refunded' or sponsorship payment_status='refunded'; writes refund_completed event |
| `charge.dispute.created` | ✅ | Writes dispute_created event; sends admin email notification to admin@dragoncandy.io |
| `transfer.updated` | ✅ | Checks if reversed; writes transfer_failed event; restores pending_balance via increment_pending_balance RPC |

**Events NOT Handled:**
| Event | Impact |
|---|---|
| `payout.paid` / `payout.failed` | P2: Can't confirm creator actually received funds in bank (Stripe Express handles this) |
| `payment_intent.succeeded` | Low risk: covered by checkout.session.completed |
| `charge.dispute.closed` | P2: No tracking of dispute resolution |

**Signature Verification:** ✅ `stripe.webhooks.constructEventAsync(body, signature, webhookSecret)` at line 45. Raw body via `req.text()`.

**Idempotency:** ✅ Full implementation:
1. Insert into `stripe_webhook_events` with `event_id` PK and `status='processing'` (line 54)
2. If unique_violation (23505) → already processed, return 200 (line 58)
3. On success → update status to 'processed' (line 425)
4. On error → update status to 'failed' with error_message (line 414), return 500 for retry

**Out-of-order tolerance:** ✅ Conditional updates (`.eq('escrow_status', 'pending')`) prevent stale events from overwriting newer state.

**Retry safety:** ✅ Returns 500 on failures → Stripe retries. Idempotency prevents double-processing.

**Severity:** MOSTLY GOOD. P2 gaps only (payout.* events, dispute resolution).

---

### A-FLOW 6: Refund / Dispute Path

**Dispute Handler:** ✅ EXISTS. `charge.dispute.created` webhook:
- Writes `dispute_created` payment event with reason, status, charge_id
- Sends admin notification email to `admin@dragoncandy.io`
- **No automated evidence submission** — dispute is logged and admin notified for manual handling

**Refund Handler:** ✅ EXISTS (webhook side). `charge.refunded` webhook:
- Updates `escrow_status='refunded'` or `payment_status='refunded'`
- Writes `refund_completed` payment event

**Business-Initiated Refund Flow:** ❌ NOT BUILT.
- No UI button for business to request a refund
- No edge function to call `stripe.refunds.create()`
- The webhook handles Stripe-side refunds (e.g., admin refunds via Stripe dashboard), but there's no in-app refund flow

**Failure Modes:**
- **P0: Business has no way to get a refund through the app.** They'd need to contact support, who would refund via Stripe dashboard.
- Dispute handler logs + emails but doesn't automatically submit evidence or pause payouts.
- **Ledger reflects refunds correctly** (refund_completed event written by webhook). Good.

**Severity:** P0 (no in-app refund flow → drives chargebacks), P1 (no automated dispute evidence)

---

### A-FLOW 7: DragonDash Rush Premium

**Current Code Path:**
- `campaigns.delivery_type`: standard / expedited / dragonrush
- `campaigns.delivery_fee`: premium amount set in wizard
- `create-campaign-escrow`: `totalAmount = amount + deliveryFee` (business pays)
- `release-creator-payout`: `payoutAmount = (fixed_price OR budget_max) + delivery_fee` minus 5% fee
- Creator receives full delivery fee minus platform cut
- `useDragonDashTimer.ts`: Timer durations — standard: 72hr, expedited: 10hr, dragonrush: 2hr

**Severity:** P2 (works as designed; premium split is a business decision)

---

### A-FLOW 8: Tax / 1099

**Current State:**
- Stripe Connect Express handles 1099-K for connected accounts exceeding IRS thresholds
- No platform-side 1099 logic. Creator earnings computed at render time in `CreatorEarnings.tsx`.
- Acceptable for launch; Stripe handles the regulatory obligation.

**Severity:** P2 (post-launch nice-to-have)

---

### A-FLOW 9: Creator Payout Dashboard

**Current State** (`src/pages/CreatorEarnings.tsx`):
- ✅ Stripe Balance (available) — live from `check-creator-payout-status`
- ✅ Wallet Balance (platform pending_balance) — from DB
- ✅ Total Earned — computed from completed collaborations
- ✅ Payment history with per-item status (Paid / Pending / In Wallet)
- ✅ "Connect Stripe" / "Complete Setup" prompt if not onboarded
- ✅ "Withdraw" button when pending_balance > 0 and onboarding complete
- ✅ "View Stripe Dashboard" link (Express login link)
- ✅ Auto-refreshes every 30 seconds
- ❌ No "next payout date" shown (Stripe Express handles scheduling)
- ✅ 5% fee displayed per payment

**Severity:** P2 (minor UX gap: no next payout date)

---

### A-FLOW 10: Business Spend Dashboard

**Current State:**
- `BusinessProjects.tsx`: Project list with status tabs, content review queue
- `ProjectDetailsPage.tsx`: Per-project value, deadline, status
- **No aggregate spend view** (total spent, pending approvals, refunded, upcoming)
- `PaymentsPage.tsx` exists with active/completed/issues tabs grouping payment events — provides some visibility but is entity-level, not aggregate-summary.

**Severity:** P1 (business should see total spend at a glance)

---

## 5. TRIAGED BUG LIST

### P0 — BLOCKS LAUNCH (Financial Exposure)

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P0-1 | **Campaign-deliverables bucket `public: true` flag** — Supabase public URL endpoint bypasses RLS | `supabase/migrations/20250618155000:4` | Change to `public: false` in a new migration: `UPDATE storage.buckets SET public = false WHERE id = 'campaign-deliverables'` | S | Raw creator content downloadable via direct URL without auth |
| P0-2 | **No content REJECT path** — business can only approve or request revision (max 2), then must approve | `src/components/projects/ContentApprovalPanel.tsx` | Add REJECTED status to content_status CHECK, reject button with reason, trigger refund flow | M | Business forced to pay for unacceptable content; drives chargebacks |
| P0-3 | **No in-app refund flow** — business cannot request refund through the app | N/A (missing) | Build `refund-campaign-escrow` edge function using `stripe.refunds.create()`. Add "Request Refund" button. Write refund_requested payment event. | M | Stuck funds; business contacts bank instead → chargeback |

### P1 — SHOULD FIX BEFORE LAUNCH

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P1-1 | **No auto-approval timer** — creator waits indefinitely if business doesn't respond | N/A (missing) | Create Supabase scheduled function: auto-approve content_status='submitted' after 48hr (Standard), 24hr (Expedited), 4hr (DragonRush). Call release-creator-payout. | M | Creator cash flow blocked; creator churn |
| P1-2 | **Revision limit client-side only** — MAX_REVISIONS=2 checked in React, not server-side | `src/components/projects/ContentApprovalPanel.tsx:30` | Add CHECK constraint or trigger on campaign_collaborations: `revision_count <= 2`. Or add server check in a Postgres function. | S | Unlimited revisions via direct API; creator harassment |
| P1-3 | **Platform fee is 5% but spec says 15-20%** | `release-creator-payout/index.ts:102`, `create-campaign-escrow/index.ts:97` | Confirm with product team. Extract to shared constant or config table. Currently hardcoded as `0.05` in 4 edge functions. | S | Revenue shortfall if unintentional |
| P1-4 | **No confirmation dialog on "Approve & Release Payment"** | `ContentApprovalPanel.tsx:93-112` | Add AlertDialog confirmation before calling release-creator-payout | S | Accidental irreversible payout on mis-click |
| P1-5 | **Ledger write is AFTER Stripe transfer, not before** | `release-creator-payout/index.ts:132-161` | Move writePaymentEvent for payment_released BEFORE stripe.transfers.create, update with stripe_id after | S | Missing ledger entry if process crashes between transfer and write |
| P1-6 | **No business spend dashboard** — no aggregate spend view | `src/pages/BusinessProjects.tsx` | Add stats cards: total escrowed, total released, pending approvals | S | Business confusion about charges |
| P1-7 | **Inconsistent Stripe API versions** | `get-stripe-dashboard-link/index.ts:78` uses "2023-10-16"; others use "2025-08-27.basil" | Standardize to latest | S | Potential API behavior differences |
| P1-8 | **No dispute evidence automation** — dispute webhook logs + emails admin but no evidence submission | `stripe-webhook/index.ts:320-355` | Add evidence auto-population (delivery proof, approval timestamps, content screenshots) | M | Platform loses disputes by default |

### P2 — POST-LAUNCH

| # | Issue | File:Line | Fix | Effort | Financial Risk |
|---|---|---|---|---|---|
| P2-1 | No Sentry/error tracking on edge functions | All edge functions | Add Sentry Deno SDK or log drain | M | Silent failures in production |
| P2-2 | Console.log used in all edge functions | All edge functions | Acceptable for now; add structured logging later | S | Log noise |
| P2-3 | No pagination on CreatorEarnings payment history | `src/pages/CreatorEarnings.tsx:91-130` | Add pagination/infinite scroll | S | Slow load for prolific creators |
| P2-4 | No "next payout date" on creator earnings | `src/pages/CreatorEarnings.tsx` | Fetch from Stripe payout schedule | S | Minor UX gap |
| P2-5 | CSS watermarks trivially bypassable | `src/components/projects/ProtectedFilePreview.tsx` | Implement server-side image watermarking (Sharp/Jimp in edge function) | L | Determined users can screenshot; acceptable for v1 with private bucket |
| P2-6 | Payout amount uses budget_max fallback for bid_range campaigns | `release-creator-payout/index.ts:90-95` | Use accepted application bid amount instead | S | Potential overpayment |
| P2-7 | DragonDash delivery fee has no min/max enforcement | Campaign wizard | Add server-side validation | S | Business could set $0 rush fee |
| P2-8 | `payout.paid` / `payout.failed` webhooks not handled | `stripe-webhook/index.ts` | Add handlers for bank deposit confirmation | S | Can't confirm creator received bank deposit |

---

## 6. ROOT-CAUSE PATTERNS

### Pattern 1: Payment Helper Fragmentation
The `0.05` platform fee is hardcoded in 4 edge functions. Amount calculation (fixed_price vs budget_max + delivery_fee) is duplicated between edge functions and frontend. **Recommendation:** Create `_shared/pricing.ts` with fee calculation and amount resolution. The `_shared/payment-events.ts` helper is a good pattern to extend.

### Pattern 2: Content State Machine Lacks Server-Side Guards
The content_status transitions (pending → in_progress → submitted → revision_requested → approved) are enforced only by which UI buttons are shown. No Postgres CHECK or trigger prevents illegal transitions (e.g., pending → approved, skipping submission). **Recommendation:** Add a trigger or RLS policy that validates transitions.

### Pattern 3: Missing "Unhappy Path" Flows
The happy path (create → pay → deliver → approve → payout) is fully built. The unhappy paths (reject, refund, dispute evidence, auto-escalation) are partially built (dispute logging exists) but have no user-facing flows. This is the highest-priority gap for launch.

---

## 7. OPEN QUESTIONS (Require Product Decision)

1. **Platform fee rate:** Is 5% the intentional pre-launch rate, or should it be 15-20% per the Moat Playbook?
2. **Auto-approval timer:** What are the timeouts? Suggested: 48hr Standard, 24hr Expedited, 4hr DragonRush. Confirm.
3. **Content rejection flow:** Should rejected content trigger automatic full refund, partial refund, or go to a dispute queue?
4. **Chargeback absorption:** Should the platform absorb chargebacks under $50 to reduce dispute friction?
5. **Bucket visibility:** Can we flip `campaign-deliverables` to `public: false` without breaking existing file access? (Answer: yes, all file access goes through signed URLs already.)
6. **Manual capture vs current approach:** The "charge immediately, transfer later" model works. Is this acceptable for legal/compliance?
7. **DragonDash premium split:** Should the platform take an additional cut of the delivery fee beyond the standard %?

---

## 8. POST-LAUNCH RECOMMENDATIONS (First 90 Days)

1. **Sentry integration** on all edge functions
2. **Ledger reconciliation cron** — weekly job comparing payment_events against Stripe API state
3. **Monthly payout report** — automated email to creators with earnings summary
4. **Dispute evidence automation** — pre-populate with collaboration data, delivery proof, approval timestamps
5. **Payment retry queue** — for failed transfers, auto-retry with exponential backoff
6. **Business invoice generation** — downloadable receipts
7. **Server-side watermarking** — Sharp/ffmpeg for real pixel-level watermarks
8. **Content status state machine** — Postgres trigger enforcing valid transitions

---

## BUG / ISSUE CHECKLIST

### PAYMENT INTEGRITY
- [x] Webhook signature verification on every Stripe webhook handler
- [x] Idempotency check via event_id and stripe_webhook_events table
- [x] Out-of-order webhook tolerance (conditional `.eq()` clauses)
- [ ] **ABSENT** — Manual capture (escrow) — uses auto-capture Checkout Sessions (functional but platform holds funds)
- [x] Transfer to creator happens ONLY after approval
- [x] Platform fee computed server-side — **but 5% vs 15-20% spec needs clarification**
- [x] Ledger (payment_events) written on all payment state changes — **but AFTER Stripe call, not before**
- [x] Transfer idempotency key prevents duplicate payouts
- [ ] **ABSENT** — In-app refund flow (webhook handles Stripe-side refunds)
- [x] Dispute handler exists — logs + admin email
- [x] Stripe keys are env vars, not hardcoded; test mode only

### CONTENT SECURITY
- [ ] **NEEDS_FIX** — Bucket `public: true` flag allows direct URL bypass of RLS (P0-1)
- [x] CSS watermark overlay on previews (client-side)
- [x] Raw asset download gated by content_status check in get-watermarked-preview
- [x] Signed URLs have finite TTL (3600 seconds)
- [x] Business sees "Preview Only" badge + disabled download pre-approval

### STATE MACHINE INTEGRITY
- [x] Content status transitions use explicit enum values (CHECK constraint on column)
- [ ] **ABSENT** — Illegal transitions blocked server-side (no trigger/guard)
- [ ] **ABSENT** — State changes wrapped in transaction
- [ ] **ABSENT** — Auto-approval timer as scheduled function
- [ ] **PARTIAL** — Revision limit enforced client-side (MAX_REVISIONS=2), not server-side

### AUTHORIZATION / RLS
- [x] Creator can only see their own submissions and earnings
- [x] Business can only see submissions for campaigns they own
- [x] Edge functions verify caller role before mutating
- [x] payment_events RLS: collaboration participants only, sponsorship participants only
- [x] stripe_webhook_events: service_role only (no public policies)
- [x] insert_payment_event RPC: whitelisted event types, participant check

### ERROR / EMPTY / LOADING STATES
- [x] Async fetches wrapped in try/catch with toast on failure
- [x] Loading skeletons on submissions list, approvals queue, earnings
- [x] Empty states for "no submissions yet," "no pending approvals," "no earnings yet"
- [x] Error states for failed API calls (CreatorEarnings shows error alerts)
- [ ] **NEEDS_INFO** — ErrorBoundary wraps delivery + payment routes

### UX CLARITY
- [x] Business understands when charged (escrow at campaign creation)
- [x] Creator understands when paid (payment timeline, toast notifications)
- [x] Approval/revision buttons visually distinct (green approve, outline revision)
- [ ] **ABSENT** — Reject action with required reason
- [x] Revision request requires specific notes (textarea, disabled when empty)
- [x] DragonDash deadline countdown visible (DragonDashTimer component)
- [ ] **ABSENT** — In-app refund request flow
- [ ] **ABSENT** — Confirmation dialog on approve

### DESIGN SYSTEM
- [x] Teal/pink color scheme, rounded components, shadcn/ui
- [x] Mobile renders at 375px (responsive layouts with overflow-hidden)
- [x] Preserved lg: classes

### PERFORMANCE / RELIABILITY
- [x] Webhook handler is lightweight (DB updates + fire-and-forget events)
- [x] webhook_events status tracking allows retry diagnosis
- [ ] **NEEDS_INFO** — Submissions list paginated
- [x] Edge function cold-start acceptable (small Deno functions)

### OBSERVABILITY
- [x] Console.log with `[FUNCTION-NAME]` prefix in all edge functions
- [x] payment_events table queryable for audit trail
- [x] stripe_webhook_events table queryable for webhook processing history
- [ ] **ABSENT** — Sentry or equivalent error tracking
