# Content Delivery & Payment Workflow Redesign

> Design spec for the full post-acceptance content delivery journey and
> Stripe payment UX across all delivery tiers and roles.

## Problem Statement

After a campaign applicant is accepted by a restaurant, there is no clear
path to the content delivery workspace. The creator sees "Your application
has been accepted!" with a "Cross-Post to Your Socials" button (premature)
and "Message [Restaurant]" — but no way to navigate to the project where
they upload content, start timers, and submit deliverables.

The same gap exists when a Brand sponsorship is involved — the creator
has no visibility into sponsorship-funded projects.

On the payment side, Stripe test mode lacks UX polish: no pre-filled test
credentials, no clear TEST MODE indicators, and Stripe Connect onboarding
for creators is buried on the project page instead of surfaced proactively.

## Scope

This redesign covers five interconnected subsystems:

1. Post-acceptance state machine and navigation
2. Creator Collaboration Dashboard with earnings summary
3. Redesigned Project Workspace (content delivery hub)
4. Stripe onboarding and test-mode payment UX
5. Restaurant/Brand review and approval flow

## Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pre-escrow access | Soft gate with visibility | Creator sees requirements but can't submit until escrow clears. Preserves DragonDash speed without risking uncompensated work. |
| Content delivery workspace | Dedicated project page with first-arrival stepper | Uses existing ProjectDetailsPage as the workspace. Navigation wired from accepted application card. Inline stepper for orientation. |
| Delivery tier UX | Same interface, different urgency cues | DragonDash: red gradient countdown. Express: blue gradient timer. Standard: teal due date. Same upload flow for all. |
| Sponsorship handling | Unified project, hidden complexity | Creator sees one project regardless of funding sources. Restaurant remains primary reviewer. Brand sponsorship tracked behind the scenes. |
| Stripe onboarding timing | Encourage early, require at transaction | First-run mission offers "Set Up Payouts" (skippable). Hard gate at first payout if skipped. |
| Test mode UX | Polish with pre-filled test credentials | TEST MODE banner, quick-copy test card numbers, test bank details for Connect onboarding. |

---

## Section 1: Post-Acceptance State Machine

Six states from acceptance to completion, visible and actionable on both
the creator and restaurant sides.

```
Application Accepted
       │
       ▼
┌─────────────────────┐
│  ESCROW PENDING     │  Creator: project brief, deliverable requirements,
│  (Soft Gate)        │  delivery tier, deadline preview. "Start" disabled.
│                     │  Restaurant: "Pay to activate project" CTA.
└────────┬────────────┘
         │ Restaurant pays escrow
         ▼
┌─────────────────────┐
│  PROJECT ACTIVE     │  Creator: "Start Content Creation" enabled.
│  (Timer Not Started)│  Deliverable checklist visible. Upload available.
└────────┬────────────┘
         │ Creator clicks "Start"
         ▼
┌─────────────────────┐
│  IN PROGRESS        │  Timer running (urgency cues per tier).
│  (Content Creation) │  Upload files, check off deliverables.
└────────┬────────────┘
         │ Creator clicks "Submit"
         ▼
┌─────────────────────┐
│  UNDER REVIEW       │  Restaurant reviews. Can approve, request revision
│  (Awaiting Approval)│  (max 2), or reject. Auto-approval timer ticking.
└────────┬────────────┘
         │ Approved (manual or auto)
         ▼
┌─────────────────────┐
│  COMPLETED          │  Payment released to creator.
│  (Payment Released) │  Both parties prompted to leave review.
└─────────────────────┘
```

### State-to-database mapping

The `campaign_collaborations` table already has `content_status` supporting
most of these states. Mapping:

| UI State | `content_status` value | Notes |
|----------|----------------------|-------|
| Escrow Pending | `pending` | `escrow_status = 'pending'` or null |
| Project Active | `pending` | `escrow_status = 'held'` |
| In Progress | `in_progress` | `content_started_at` set, timer running |
| Under Review | `submitted` | `submitted_at` set |
| Revision Requested | `revision_requested` | `revision_count` incremented |
| Completed (approved) | `approved` or `auto_approved` | Payment released |
| Completed (rejected) | `rejected` | Escrow refunded |

No new columns needed — the existing schema supports the full state
machine. The change is purely UX: surfacing these states with clear
navigation and actions.

### Sponsorship integration

When a Brand sponsor is attached via `campaign_sponsorships`, the
project appears as a single unified entry to the creator. The restaurant
remains the primary reviewer. Both the restaurant's escrow and the
brand's sponsorship payment fund the creator's payout, but the creator
sees one deliverable set and one approval flow.

The `campaign_sponsorships` table tracks the brand's contribution
amount and payment status independently. On approval,
`release-creator-payout` and `release-sponsorship-payout` edge functions
handle the dual disbursement.

### Donny AI automated message

When a creator's application is accepted, Donny sends an automated
message to the creator via the messaging system:

> "You've been accepted for [Campaign Name]! Here's what's next:
> [link to project]. Your delivery type is [Standard/Express/DragonDash]
> with a [timeframe] window."

This provides a second navigation path to the workspace and sets
delivery expectations immediately.

---

## Section 2: Creator Collaboration Dashboard

Replaces the current "My Applications" accepted-state view with a
project-centric dashboard.

### Earnings summary header

Pink gradient header (`#F9A8D4` → `#F9C8E0`) with three stat boxes:

| Stat | Source | Color |
|------|--------|-------|
| **Earned** | Sum of all completed project payouts (all-time) | Black text |
| **In Escrow** | Sum of active project escrow amounts | Amber (`#B8860B`) |
| **Available** | Released funds pending withdrawal | Teal (`#4DD9C0`) |

All stats are all-time totals. A monthly breakdown is out of scope for
this spec — it can be added later as a toggle if needed.

If the creator hasn't completed Stripe Connect onboarding, a soft nudge
appears below the stats: "Set up payouts to withdraw earnings — takes
about 2 minutes" with a "Set Up →" link. Non-blocking.

### Project cards list

Vertical scrolling list of project cards, each showing:

- **Left border color** indicates tier: red `#FF4444` (DragonDash),
  blue `#3B82F6` (Express — new color, not in existing palette, added
  to differentiate from Standard's teal), teal `#4DD9C0` (Standard),
  amber `#FACC15` (awaiting escrow), gray `#888` (completed)
- **Tier badge** with icon: `🐉 DRAGONDASH`, `⚡ EXPRESS`, `STANDARD`,
  `⏳ AWAITING PAYMENT`, `✓ COMPLETED`
- **Timer** (DragonDash/Express only): countdown with urgency-appropriate
  color
- **Project name** and restaurant name
- **Deliverable summary**: "2 Reels", "3 Photos, 1 Reel"
- **Payment amount**: bold, right-aligned
- **Progress bar**: deliverables uploaded / total
- **Action link**: "Continue →", "Start →", "Preview Brief →"

### Filter chips

Horizontal pill chips at top: All (count), Active, Pending, Completed.
Default to "All" on load.

### Route

The Creator Dashboard lives at `/dashboard/creator/projects` (new route).

### Card tap behavior

Tapping a project card navigates to the Project Workspace
(`/dashboard/creator/projects/:collaborationId`).

For "Awaiting Payment" cards, tapping navigates to a read-only view
of the project workspace with the soft gate visible (brief and
requirements shown, "Start" button disabled, amber banner explaining
escrow is pending).

---

## Section 3: Project Workspace (Content Delivery Hub)

Single page for all delivery tiers. Layout from top to bottom:

### Top bar

- Back arrow → Creator Dashboard
- Project name and restaurant name
- Delivery tier badge (color-coded)

### Timer area (tier-specific urgency)

Same layout structure, different visual treatment:

| Tier | Background | Font size | Display |
|------|-----------|-----------|---------|
| DragonDash | Red gradient (`#FF4444` → `#FF6B6B`) | 36px monospace | `H:MM:SS` countdown |
| Express | Blue gradient (`#3B82F6` → `#60A5FA`) | 28px monospace | `HH:MM:SS` countdown |
| Standard | Teal gradient (`#4DD9C0` → `#6EE7D0`) | 22px regular | `May 14, 2026` with "X days remaining" subtitle |

All tiers show a progress bar (elapsed / total time). DragonDash
progress bar is white on red. Express is white on blue. Standard is
white on teal.

Timer area is hidden in the ESCROW PENDING state.

### Step progress indicator

Horizontal stepper showing the user's position in the workflow.
Each role sees different steps:

**Creator stepper:** `Brief → Started → Upload → Submit → Paid`

**Restaurant stepper:** `Paid → Creating → Review → Done`

- Completed steps: teal circle with checkmark
- Current step: tier-colored circle with step number, subtle ring shadow
- Future steps: gray circle with step number

This provides first-arrival orientation for new users and ongoing
awareness for returning users. It disappears after the project is
completed (COMPLETED state).

### Campaign brief (collapsible)

- Brief text from `campaigns.description`
- Format tag chips: aspect ratio, platform, content type
- Collapsed by default after the creator has started content creation
- Open by default on first visit

### Deliverables checklist

Each deliverable is a card showing:

**Uploaded state:**
- Content type icon (🎬 video, 📸 photo)
- Deliverable name and file details (filename, size, duration for video)
- Teal checkmark indicator
- Teal border, light teal background

**Not-yet-uploaded state:**
- Content type icon (grayed)
- Deliverable name in gray
- "Upload" pill button (teal)
- Dashed gray border

**Revision-requested state:**
- Content type icon
- Deliverable name with "Needs revision" label in amber
- Restaurant feedback quoted in amber background box
- "Re-upload" pill button (amber)

**Approved (partial, during revision):**
- Same as uploaded state but with "✓ Approved" label in teal

Upload triggers the existing `ProjectFileUpload` dialog for file
selection (reused as-is, opened inline from the deliverable card).

### Payment breakdown

Transparent fee display:

- Content fee: `$XXX.XX`
- Rush fee (DragonDash only): `+$75.00` in red
- Delivery fee (Express only): `+$25.00` in blue
- Platform fee (based on org take rate): `-$XX.XX` in gray
- **Your payout**: bold, teal, with escrow status badge

### Submit button

- **Disabled** (gray) until all deliverables are uploaded. Shows message:
  "Upload remaining X deliverable(s) to enable submission"
- **Enabled** (teal) when all deliverables are uploaded: "Submit for Review"
- **Disabled** (gray) in ESCROW PENDING state: "Waiting for Escrow Payment"

### Message link

"💬 Message [Restaurant Name]" link centered below the submit button.
Opens existing messaging flow.

---

## Section 4: Stripe Onboarding & Test-Mode Payment UX

### Creator Stripe Connect onboarding

Two touchpoints per the "encourage early, require at transaction" strategy:

**Touchpoint 1 — First-run mission (soft nudge)**

Added to the first-run onboarding mission checklist as "Set Up Payouts":

- Icon: 💳 on teal gradient background
- Title: "Set Up Payouts"
- Subtitle: "Get paid directly to your bank account"
- Description: "Connect your bank account so you can receive payments
  instantly when content is approved. Takes about 2 minutes."
- Buttons: "Set Up Now" (teal, primary) | "Skip for Now" (gray, secondary)
- Footer: "You can always set this up later in Settings"

Clicking "Set Up Now" calls `create-creator-connect-account` edge function
and redirects to Stripe's hosted onboarding flow. On return, marks the
mission as complete in `first_run_missions` JSONB.

**Touchpoint 2 — First payout (hard gate)**

When content is approved and the creator hasn't connected Stripe:

- Celebration header: 🎉 "Content Approved!"
- Payout amount displayed prominently in teal box
- Amber warning: "Set up payouts to receive this payment. Your earnings
  are held safely until your account is connected."
- Primary CTA: "Connect Bank Account" (teal, full-width)
- Footer: "Powered by Stripe • Secure & encrypted"

Earnings are held in `pending_balance` on `creator_profiles` until
Stripe Connect is completed. The `release-creator-payout` edge function
already supports this path.

### Restaurant/Brand Stripe Connect onboarding

Same two-touchpoint pattern:

- First-run mission: "Set Up Payments" for restaurants
- Hard gate: when restaurant tries to pay escrow without Stripe setup

Uses `create-restaurant-connect-account` edge function.

### Escrow checkout (restaurant paying)

When a restaurant accepts a creator, they see an "Activate Project" screen:

- Project name and creator handle
- Fee breakdown: content fee + rush/delivery fee + platform fee = total
- Escrow explanation: "Funds are held in escrow and only released when
  you approve the content. Full refund if you reject."
- Primary CTA: "Pay & Activate Project" → redirects to Stripe Checkout
  via `create-campaign-escrow` edge function
- Stripe Checkout handles card input (no custom card form needed)

### Test mode UX polish

**TEST MODE banner:**

Persistent yellow banner on all payment-related screens when Stripe is
in test mode (detected by `pk_test_` prefix on publishable key):

- Background: `#FEF3C7` with `#F59E0B` border
- Icon: 🧪
- Text: "TEST MODE — No real money is charged"
- Subtitle: "Use test card numbers below to simulate payments"

**Quick-copy test card helper:**

Shown on payment screens in test mode, expandable panel with:

| Card | Number | Result |
|------|--------|--------|
| Visa | `4242 4242 4242 4242` | Always succeeds |
| Mastercard | `5555 5555 5555 4444` | Always succeeds |
| Visa (decline) | `4000 0000 0000 9995` | Always declines |

Each row has a "Copy" button for one-tap clipboard copy.

Footer: "Exp: any future date • CVC: any 3 digits • ZIP: any 5 digits"

**Creator Connect test credentials:**

During Stripe Connect onboarding in test mode, a helper panel shows:

- Routing number: `110000000`
- Account number: `000123456789`
- SSN last 4: `0000`
- Note: "Stripe auto-populates most fields in test mode. Just click through."

### Test mode detection

The test mode banner and helpers render conditionally based on:

```typescript
const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');
```

This ensures helpers disappear automatically when switching to live keys
with no code changes needed.

---

## Section 5: Restaurant/Brand Review & Approval Flow

### Review notification

When a creator submits content, the restaurant sees:

- Amber "REVIEW" badge in the top bar
- Notification banner: "Content submitted for your review"
- Auto-approval countdown: "Auto-approved in Xh if no action taken"

### Submitted content display

Each deliverable shown as a card with:

- Preview thumbnail (video play button overlay for video content)
- File name, size, duration
- "Preview ↗" link to view full content via `ProtectedFilePreview`
- Teal border indicating delivered status

### Auto-approval timer

Visual countdown with progress bar:

| Tier | Auto-approval window | Extension |
|------|---------------------|-----------|
| Standard | 48 hours | +24 hours (once) |
| Express | 24 hours | +24 hours (once) |
| DragonDash | 4 hours | +2 hours (once) |

If the restaurant doesn't act within the window, content is auto-approved
and payment is released. The `auto-approve-content` edge function (cron)
handles this.

### Action buttons (priority order)

1. **Approve & Release Payment** (teal, primary, full-width)
   - Confirmation dialog before release
   - Calls `release-creator-payout` edge function
   - Transitions to COMPLETED state

2. **Request Revision** (amber outline, full-width)
   - Shows "(X remaining)" count
   - Opens revision request modal (see below)
   - Max 2 revisions per project (`MAX_REVISIONS` constant)

3. **Reject & Refund** (red outline, smaller, full-width)
   - Confirmation dialog with reason field
   - Calls `refund-campaign-escrow` edge function
   - Transitions to rejected/cancelled state

### Revision request modal

- Per-deliverable checkboxes to select which items need changes
- Text area for specific feedback on each selected deliverable
- Deliverables not needing revision show "Looks good ✓" badge
- "Send Revision Request" button (amber)
- Counter: "Revision X of 2"

On submission:
- `content_status` transitions to `revision_requested`
- `revision_count` incremented
- Feedback sent as a message to the creator via messaging system
- `deliverables_status` updated per-deliverable

### Creator revision experience

When revision is requested, the creator's project workspace shows:

- Yellow banner: "Revision requested (X of 2)"
- Deliverables needing revision: amber border, restaurant feedback
  quoted inline, "Re-upload" button
- Deliverables already approved: teal border, "✓ Approved" label,
  no action needed
- Submit button disabled until revised deliverables are re-uploaded
- On resubmission, `content_status` transitions back to `submitted`

---

## Components Inventory

### New components

| Component | Purpose |
|-----------|---------|
| `CreatorDashboard` | Earnings summary + project cards list with filters |
| `EarningsSummary` | Three-stat header (earned, in escrow, available) |
| `ProjectCard` | Individual project card with tier badge, timer, progress |
| `ProjectStepper` | Horizontal step indicator (Brief → Started → Upload → Submit → Paid) |
| `TierTimer` | Tier-specific timer display (red/blue/teal variants) |
| `DeliverableCard` | Per-deliverable upload/status card |
| `RevisionRequestModal` | Per-deliverable feedback form for restaurants |
| `RevisionBanner` | Creator-facing revision notification with inline feedback |
| `EscrowCheckout` | Restaurant escrow payment screen with fee breakdown |
| `StripeTestHelper` | Test card numbers and bank details quick-copy panel |
| `TestModeBanner` | Yellow TEST MODE indicator banner |
| `PayoutGate` | Hard-gate screen for first payout without Stripe Connect |

### Modified components

| Component | Changes |
|-----------|---------|
| `ProjectDetailsPage` | Integrate TierTimer, ProjectStepper, DeliverableCard, soft gate state |
| `ContentApprovalPanel` | Add auto-approval timer, per-deliverable review, revision modal |
| `CreatorContentSubmit` | Replace with DeliverableCard-based upload flow |
| `CreatorPayoutBanner` | Replace with EarningsSummary integration + PayoutGate |
| `ProjectFileUpload` | Integrate into DeliverableCard inline upload |
| `DragonDashTimer` | Replace with TierTimer (supports all three tiers) |
| `StartContentButton` | Integrate into ProjectStepper flow |
| First-run missions | Add "Set Up Payouts" mission for creators, "Set Up Payments" for restaurants |

### Existing components (unchanged)

| Component | Role |
|-----------|------|
| `PaymentTimeline` | Payment event history (already works) |
| `ProtectedFilePreview` | File viewing (already works) |
| `SponsorshipStatusCard` | Sponsorship tracking (already works, hidden from creator) |

---

## Edge Functions Inventory

### Existing (no changes needed)

| Function | Role |
|----------|------|
| `create-campaign-escrow` | Creates Stripe Checkout for escrow payment |
| `verify-campaign-escrow` | Confirms escrow payment success |
| `release-creator-payout` | Transfers funds to creator on approval |
| `auto-approve-content` | Cron job for auto-approval |
| `create-creator-connect-account` | Stripe Connect onboarding for creators |
| `create-restaurant-connect-account` | Stripe Connect onboarding for restaurants |
| `check-creator-payout-status` | Polls creator Stripe account status |
| `create-sponsorship-checkout` | Sponsorship payment via Stripe |
| `release-sponsorship-payout` | Sponsorship fund release |
| `refund-campaign-escrow` | Escrow refund on rejection |
| `stripe-webhook` | Webhook handler for Stripe events |

### New or modified

| Function | Changes |
|----------|---------|
| `transition_content_status` RPC | Add validation for revision-specific transitions and per-deliverable status updates |

---

## Database Changes

No new tables or columns required. The existing schema supports the
full state machine:

- `campaign_collaborations.content_status` — all UI states map to
  existing enum values
- `campaign_collaborations.escrow_status` — distinguishes ESCROW PENDING
  from PROJECT ACTIVE within `content_status = 'pending'`
- `campaign_collaborations.deliverables_status` — JSONB already supports
  per-deliverable tracking
- `campaign_collaborations.revision_count` — tracks revision usage
- `creator_profiles.stripe_account_id` / `stripe_onboarding_complete` —
  existing columns for Connect status
- `creator_profiles.pending_balance` — holds funds when Connect isn't set up
- `profiles.first_run_missions` — JSONB for onboarding mission state

---

## Implementation Sequence

Recommended build order (each is independently shippable):

1. **State machine + navigation wiring** — Wire "Go to Project" from
   accepted application card. Add soft gate state to ProjectDetailsPage.
   Add Donny automated acceptance message.

2. **TierTimer + ProjectStepper** — Replace DragonDashTimer with
   tier-aware TierTimer. Add step progress indicator.

3. **DeliverableCard + upload flow** — Replace current upload UI with
   per-deliverable cards. Integrate inline upload.

4. **Creator Dashboard + EarningsSummary** — New dashboard page with
   earnings header and project cards list.

5. **Restaurant review flow** — Auto-approval timer display, revision
   request modal with per-deliverable feedback, revision banner for
   creators.

6. **Stripe onboarding touchpoints** — First-run mission for creators
   and restaurants. Payout gate at first transaction.

7. **Test mode polish** — TEST MODE banner, test card helper, test bank
   details for Connect onboarding.

---

## What This Deletes

- The confusing post-acceptance dead-end card with premature
  "Cross-Post to Your Socials" button
- The single-purpose DragonDashTimer component (replaced by tier-aware
  TierTimer)
- The hidden-until-project-page Stripe Connect onboarding prompt

## What This Simplifies

- One project workspace for all three delivery tiers (same layout,
  different urgency cues)
- One unified dashboard replacing scattered application/project views
- Single state machine visible to both creator and restaurant
- Sponsorship complexity hidden from creator behind unified project

## What This Automates

- Donny AI acceptance message with delivery expectations
- Auto-approval timer with extension option
- Test mode detection and helper display
- Earnings calculation across all project states

## Keystroke Count Removed

- Getting from "accepted" to project workspace: **currently impossible
  without knowing the URL** → **1 tap** (card tap or Donny message link)
- Understanding delivery requirements: **navigate to separate page,
  scroll to find brief** → **visible immediately** on project workspace
- Stripe test credentials: **look up documentation externally** →
  **one-tap copy** from inline helper
