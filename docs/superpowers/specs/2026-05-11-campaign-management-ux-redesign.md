# Campaign Management UX Redesign — Restaurant & Brand Accounts

**Date:** 2026-05-11
**Scope:** Business campaign detail page, campaigns list desktop layout, payment timeline, pending notification banner
**Approach:** Status-driven campaign detail redesign + targeted fixes (Approach B)

## Problem

Restaurant and Brand users face five UX issues in campaign management:

1. **My Campaigns list is mobile-formatted on desktop.** Single-column layout stretches across wide viewports, wasting horizontal space.
2. **Campaign detail pages are cluttered.** All information displays at once with no hierarchy. Draft campaigns show meaningless zero-state application stats. Pending campaigns bury the action under filter chrome and search bars.
3. **"Action Needed" campaigns have no CTA.** The badge says action is needed but there is no button to take it. Campaigns sit in limbo.
4. **Draft campaigns have no visible edit/publish action.** Users must hunt for the overflow menu to find editing options.
5. **Payment Timeline lacks campaign context.** Transaction entries show amounts and statuses but do not identify which campaign they belong to. No link to Stripe for transaction details.

## Design

### 1. Status Banner — Campaign Detail Page

A prominent banner at the top of every business campaign detail page answers two questions: "What's the status?" and "What do I do?" The banner replaces scattered status badges and buried CTAs with a single, state-specific block.

**Banner variants by campaign state:**

**Draft** — Light teal background (`bg-teal-50 border-teal-300`). Icon: pencil. Headline: "Draft — Not Published." Subtext: "This campaign hasn't been published yet. Edit and publish when ready." Single CTA: "Edit & Publish" (teal, full-width on mobile, inline on desktop). Zero-state application stats (0 Total, 0 Pending, 0 Accepted, 0 Rejected) are hidden entirely — they carry no meaning for a draft.

**Pending (applications awaiting review)** — Amber background (`bg-amber-50 border-amber-400`). Icon: hourglass. Headline: "{N} Application(s) Awaiting Your Review." Subtext names the creator and how long they have been waiting — e.g., "Ricky Ricardo applied 2 days ago. Review their profile to accept or decline." Single CTA: "Review Application →" (amber). Filter controls, search bar, and sort options are hidden by default; accessible via a "Filters" toggle if multiple applications exist.

**Action Needed (content submitted, needs review)** — Pink background (`bg-pink-50 border-pink-400`). Icon: eye. Headline: "Content Ready for Your Review." Subtext: "{CreatorName} submitted {N} deliverables. Approve to release payment, or request revisions." Two CTAs: "Review & Approve" (teal, primary) and "Request Revision" (pink outline, secondary).

**Active (no action needed)** — Teal background (`bg-teal-50 border-teal-300`). Icon: rocket. Headline: "Campaign In Progress." Subtext: "Step {X} of 5 — {step description}." Inline progress bar below. No CTA — nothing for the business to do.

**Completed** — Green background (`bg-green-50 border-green-300`). Headline: "Campaign Completed." CTA: "View Deliverables" or "Leave a Review" if review not yet submitted.

**Published (waiting for applications)** — Teal background, calm tone. Headline: "Campaign Published — Awaiting Applications." Application count if any. No urgent CTA.

### 2. Collapsible Sections — Campaign Detail Page

Everything below the status banner is organized into collapsible sections using the existing `CollapsibleBriefSection` component (Radix Collapsible with animated chevron).

**Sections (in order):**

- **Project Progress** — Step-by-step timeline. Auto-expands on active campaigns. Hidden on drafts.
- **Assigned Creator** — Creator card with avatar, name, project count, Message and View Portfolio actions. Collapsed header shows creator name as preview hint. Hidden on drafts and published campaigns.
- **Campaign Overview** — Title, description, budget, deadline, platforms. Auto-expands on drafts.
- **Content Requirements** — Platforms, deliverables, style direction, hashtags. Collapsed by default.
- **Compensation & Terms** — Budget breakdown, usage rights, exclusivity. Collapsed by default.
- **Logistics & Targeting** — Deadline, delivery tier, geographic scope, personas. Collapsed by default.

**Auto-expand rules:** Only the most contextually relevant section auto-expands. On drafts, Campaign Overview expands (since the user needs to review before publishing). On active campaigns, Project Progress expands. On completed campaigns, none auto-expand (the status banner is self-sufficient).

**Collapsed preview hints:** When collapsed, certain sections show a brief preview in the header row — e.g., "Assigned Creator — Ricky Ricardo" or "Campaign Overview — $500–$800 · Instagram."

### 3. Desktop Layout — Campaign Detail Page

**Desktop (lg: breakpoint and above):** Status banner spans full width. Below it, a `lg:grid lg:grid-cols-5 lg:gap-6` layout:
- **Left column (lg:col-span-3):** Workflow sections — Project Progress, Assigned Creator, content review area.
- **Right column (lg:col-span-2):** Campaign details sidebar — Campaign Overview, Content Requirements, Compensation, Logistics. The sidebar is sticky (`lg:sticky lg:top-4`).

**Mobile:** Single column. Status banner → workflow sections → campaign detail sections, all stacked vertically and collapsible.

This matches the existing `CampaignDetailsPage.tsx` grid structure (`lg:grid lg:grid-cols-5 lg:gap-6`) but restructures what goes inside each column.

### 4. Desktop Layout — Campaigns List Page

**Current state:** `CampaignsList.tsx` already has `grid grid-cols-1 lg:grid-cols-2 gap-4`. The issue is that `CampaignsPage.tsx` constrains width to `md:max-w-4xl` and uses a full-width "Create a Campaign" button.

**Changes:**

- Widen max-width constraint to `md:max-w-5xl` to give the 2-column grid room to breathe.
- Move "Create Campaign" button inline with the page heading on desktop (`lg:flex lg:justify-between lg:items-center`). On mobile it remains full-width below the heading.
- Campaign cards with urgent action get visual emphasis: pink border (`border-2 border-pink-400`) and tinted background (`bg-pink-50/50`) when `needsBusinessAction` returns true.

**Card CTA updates:**
- Draft cards show "Edit & Publish" (teal) instead of generic "View Campaign."
- Cards already have dynamic CTAs (`CampaignCard.tsx` — "Pay & Publish," "Review Content," "Review Applications," etc.). No changes needed to the existing CTA logic beyond adding the Draft-specific CTA.

### 5. Payment Timeline — Campaign Context + Stripe Link

**Campaign header card:** Each group of payment events in `PaymentTimeline.tsx` gets a header card above the timeline entries. The header card shows:
- Campaign name (bold)
- Creator/collaborator name (subtext)
- "View in Stripe ↗" link (opens the Stripe Dashboard payment page in a new tab)

**Stripe link construction:** The `payment_events` table stores `stripe_payment_intent_id` (or equivalent). The Stripe Dashboard URL is constructed as `https://dashboard.stripe.com/test/payments/{payment_intent_id}` (test mode, matching current Stripe configuration). When no payment intent ID is available, the link falls back to the general Stripe Dashboard.

**Campaign name source:** The `PaymentTimeline` component already receives `campaignId` as a prop. A lightweight query fetches the campaign title and assigned creator name. This is a single additional query per timeline group, cached by React Query.

### 6. Pending Notification Banner — Dashboard

A dashboard-level component that surfaces campaigns waiting on the current user's action.

**Placement:** Top of the dashboard content area, above the campaign list, below the page header.

**Style:** Amber background (`bg-amber-50 border border-amber-300 rounded-xl`), matching the Pending status banner tone.

**Content:** Names the campaign and the specific action — e.g., "Ricky Ricardo applied to 'Launch Hype Video' 2 days ago — Review Application →"

**CTA:** Links directly to the campaign detail page where the status banner and action CTA are waiting.

**Behavior:**
- Dismissable (stores dismissal in local state). Reappears if the action hasn't been taken after 24 hours.
- If multiple campaigns need attention, banners stack (max 3 visible, then "+ {N} more campaigns need attention" link).
- No new database tables. The component queries existing `campaign_applications` (pending applications older than 24 hours) and `campaign_collaborations` (content submitted but not reviewed) to determine what needs attention.
- Only shown to users whose role is the blocking party (restaurant/brand owners).

## Components Affected

| Component | Change |
|-----------|--------|
| `CampaignDetailsPage.tsx` | Restructure to render status banner first, then collapsible sections in two-column desktop layout |
| `CampaignDetailHeader.tsx` | Replace with new `CampaignStatusBanner` component |
| `CollapsibleCampaignDetails.tsx` | Refactor — content moves into individual `CollapsibleBriefSection` wrappers |
| `CampaignCard.tsx` | Add Draft CTA ("Edit & Publish"), add pink border/bg for action-needed cards |
| `CampaignsPage.tsx` | Widen max-width, inline Create button on desktop |
| `PaymentTimeline.tsx` | Add campaign header card with name + Stripe link |
| `PaymentSummaryCards.tsx` | No changes |
| New: `CampaignStatusBanner.tsx` | Status-driven banner component with per-state rendering |
| New: `PendingActionBanners.tsx` | Dashboard notification banners for campaigns awaiting action |

## Data Requirements

No new database tables. All data needed is already present:

- Campaign status, phase, and step: `campaigns` + `campaign_collaborations` tables, derived via `campaignPhase.ts`
- Creator name for banners: `campaign_applications` joined with `profiles`
- Application age for pending notifications: `campaign_applications.created_at`
- Stripe payment intent ID for links: `payment_events.stripe_payment_intent_id` (verify column exists; if not, add nullable column)
- Campaign name for payment timeline: `campaigns.title` fetched via `campaignId` prop

## What This Deletes

- Zero-state application stats on Draft campaigns (0/0/0/0 display)
- Filter chrome and search bars on the Pending applications view (hidden by default, toggle-accessible)
- Guesswork about what action to take on any campaign state
- Ambiguous "View Campaign" CTAs on Draft cards

## What This Simplifies

- Campaign detail page: status banner answers both "what's happening" and "what do I do" in one glance
- Information hierarchy: collapsible sections surface the relevant content and hide the rest
- Payment timeline: campaign header card makes every transaction self-identifying

## What This Automates

- Pending notification banners surface automatically based on campaign state age — no manual tracking needed
- Status banner CTA selection is fully derived from campaign phase and step — no per-campaign configuration

## Keystroke Reduction

- Draft → Edit: currently requires finding the overflow menu (3+ clicks/taps). Reduced to 1 tap on the banner CTA.
- Pending → Review Application: currently requires scrolling past filters and searching. Reduced to 1 tap on the banner CTA.
- Action Needed → Review Content: currently has no path forward. Now 1 tap on the banner CTA.
- Payment → Campaign context: currently requires cross-referencing amounts and dates. Now visible at a glance, zero taps.
