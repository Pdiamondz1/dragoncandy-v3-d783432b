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

A prominent banner at the top of every business campaign detail page answers two questions: "What's the status?" and "What do I do?" The banner replaces scattered status badges with a single, state-specific block. The existing overflow menu (Edit, Delete, Re-Launch) is preserved as a kebab menu icon in the top-right corner of the banner.

**Banner state mapping from existing types:**

The `CampaignStatusBanner` component derives its visual state from the existing `CampaignPhase` type (`pre_hire | active_delivery | completed | cancelled`), `campaign.status`, application count, and `needsBusinessAction(step)`:

| Phase | + Condition | Banner State |
|-------|-------------|--------------|
| `pre_hire` | `campaign.status === 'draft'` | Draft |
| `pre_hire` | `campaign.status === 'published'` + `escrow_status === 'pending'` | Published — Payment Pending |
| `pre_hire` | `campaign.status === 'published'` + `applicationCount === 0` | Published |
| `pre_hire` | `campaign.status === 'published'` + `applicationCount > 0` | Pending |
| `active_delivery` | `needsBusinessAction(step) === true` | Action Needed |
| `active_delivery` | `needsBusinessAction(step) === false` | Active |
| `completed` | — | Completed |
| `cancelled` | — | Cancelled |

**Banner variants:**

**Draft** — Light teal background (`bg-teal-50 border-teal-300`). Icon: pencil. Headline: "Draft — Not Published." Subtext: "This campaign hasn't been published yet. Review and publish when ready." Single CTA: "Edit Draft" (teal, full-width on mobile, inline on desktop). Navigates to the campaign editor. Zero-state application stats (0 Total, 0 Pending, 0 Accepted, 0 Rejected) are hidden entirely — they carry no meaning for a draft.

**Published — Payment Pending** — Amber background (`bg-amber-50 border-amber-400`). Icon: alert triangle. Headline: "Payment Required to Publish." Subtext: "Complete your Stripe checkout to make this campaign visible to creators." Single CTA: "Pay & Publish" (amber). Triggers the existing escrow checkout flow from `EscrowPaymentAlert`. This banner replaces the separate `EscrowPaymentAlert` component.

**Published (awaiting applications)** — Teal background (`bg-teal-50 border-teal-300`), calm tone. Icon: megaphone. Headline: "Campaign Published — Awaiting Applications." Subtext: "Your campaign is live. Creators can now discover and apply." No urgent CTA.

**Pending (applications awaiting review)** — Amber background (`bg-amber-50 border-amber-400`). Icon: hourglass. Headline: "{N} Application(s) Awaiting Your Review." Subtext varies by count:
- Single application: "{CreatorName} applied {X} days ago. Review their profile to accept or decline."
- Multiple applications: "{N} creators have applied. Oldest: {CreatorName}, {X} days ago."
Single CTA: "Review Applications →" (amber). Navigates to the applications section of the page. Filter controls, search bar, and sort options are hidden by default; accessible via a "Filters" toggle when multiple applications exist.

**Action Needed (content submitted, needs review)** — Pink background (`bg-pink-50 border-pink-400`). Icon: eye. Headline: "Content Ready for Your Review." Subtext: "{CreatorName} submitted {N} deliverables. Approve to release payment, or request revisions." Two CTAs: "Review & Approve" (teal, primary) and "Request Revision" (pink outline, secondary).

**Active (no action needed)** — Teal background (`bg-teal-50 border-teal-300`). Icon: rocket. Headline: "Campaign In Progress." Subtext: "Step {X} of 5 — {step description}." Inline progress bar below. No CTA — nothing for the business to do.

**Completed** — Green background (`bg-green-50 border-green-300`). Icon: check circle. Headline: "Campaign Completed." CTA: "View Deliverables" or "Leave a Review" if review not yet submitted.

**Cancelled** — Red-tinted background (`bg-red-50 border-red-300`). Icon: x-circle. Headline: "Campaign Cancelled." Subtext: "This campaign is no longer active." Two CTAs: "Re-Launch Campaign" (teal, creates a duplicate in draft) and "Delete" (red outline, with confirmation dialog).

### 2. Collapsible Sections — Campaign Detail Page

Everything below the status banner is organized into collapsible sections using the existing `CollapsibleBriefSection` component (Radix Collapsible with animated chevron). The component API is extended with an optional `subtitle` prop for collapsed preview hints.

**`CollapsibleBriefSection` prop additions:**
```typescript
interface CollapsibleBriefSectionProps {
  title: string;
  subtitle?: string;       // Preview hint shown in header when collapsed
  defaultOpen?: boolean;
  children: ReactNode;
}
```

The `subtitle` renders as a muted inline span next to the title, visible in both open and collapsed states.

**Sections (in order):**

- **Project Progress** — Step-by-step timeline. Auto-expands on active campaigns. Hidden on drafts and published campaigns.
- **Assigned Creator** — Creator card with avatar, name, project count, Message and View Portfolio actions. Subtitle: creator name (e.g., "Ricky Ricardo"). Hidden on drafts, published, and cancelled campaigns.
- **Campaign Overview** — Title, description, budget, deadline, platforms. Subtitle: budget + platform summary (e.g., "$500–$800 · Instagram"). Auto-expands on drafts.
- **Content Requirements** — Platforms, deliverables, style direction, hashtags. Collapsed by default.
- **Compensation & Terms** — Budget breakdown, usage rights, exclusivity. Collapsed by default.
- **Logistics & Targeting** — Deadline, delivery tier, geographic scope, personas. Collapsed by default.

**Auto-expand rules:** Only the most contextually relevant section auto-expands. On drafts, Campaign Overview expands (since the user needs to review before publishing). On active campaigns, Project Progress expands. On completed and cancelled campaigns, none auto-expand (the status banner is self-sufficient).

### 3. Desktop Layout — Campaign Detail Page

**Desktop (lg: breakpoint and above):** Status banner spans full width. Below it, a `lg:grid lg:grid-cols-5 lg:gap-6` layout:
- **Left column (lg:col-span-3):** Workflow sections — Project Progress, Assigned Creator, content review area.
- **Right column (lg:col-span-2):** Campaign details sidebar — Campaign Overview, Content Requirements, Compensation, Logistics. The sidebar is sticky (`lg:sticky lg:top-4`).

**Mobile:** Single column. Status banner → workflow sections → campaign detail sections, all stacked vertically and collapsible.

This matches the existing `CampaignDetailsPage.tsx` grid structure (`lg:grid lg:grid-cols-5 lg:gap-6`) but restructures what goes inside each column. The page's max-width constraint widens from `md:max-w-4xl` to `lg:max-w-6xl` to give the 5-column grid adequate column width at desktop breakpoints.

**Loading/error states for status banner:** While campaign data is loading, the banner area renders a single rounded skeleton placeholder (`h-24 rounded-xl animate-pulse bg-teal-50`) to reserve vertical space without flashing content. On query error, a neutral teal banner renders with headline "Unable to load campaign status" and a "Try Again" button that retriggers the query.

### 4. Desktop Layout — Campaigns List Page

**Current state:** `CampaignsList.tsx` already has `grid grid-cols-1 lg:grid-cols-2 gap-4`. The issue is that `CampaignsPage.tsx` constrains width to `md:max-w-4xl` and uses a full-width "Create a Campaign" button.

**Changes:**

- Widen max-width constraint to `lg:max-w-6xl` (72rem / 1152px) to give the 2-column grid adequate column width at the `lg:` breakpoint. Below `lg:`, the single-column layout does not need a wider constraint.
- Move "Create Campaign" button inline with the page heading on desktop (`lg:flex lg:justify-between lg:items-center`). On mobile it remains full-width below the heading.
- Campaign cards with urgent action get visual emphasis: pink border (`border-2 border-pink-400`) and tinted background (`bg-pink-50/50`) when `needsBusinessAction` returns true.

**Card CTA updates:**
- Draft cards show "Edit Draft" (teal) instead of the default "View Campaign." This requires a new branch in `CampaignCard.tsx`'s CTA logic: when `campaign.status === 'draft'`, render "Edit Draft" and navigate to the campaign editor (not the detail page). This branch must come before the existing `applicationCount` check in the CTA priority chain.
- Cards with `escrow_status === 'pending'` continue to show "Pay & Publish →" (amber) — this takes priority over the Draft CTA.
- All other existing dynamic CTAs ("Review Content," "Review Applications," "View Progress," etc.) remain unchanged.

### 5. Payment Timeline — Campaign Context + Stripe Link

**Campaign header card:** Each group of payment events in `PaymentTimeline.tsx` gets a header card above the timeline entries. The header card shows:
- Campaign name (bold)
- Creator/collaborator name (subtext)
- "View in Stripe ↗" link (opens the Stripe Dashboard payment page in a new tab)

**Stripe link construction:** The `payment_events` table stores `stripe_id` (nullable string). The value may contain a payment intent ID (`pi_*`), charge ID (`ch_*`), or transfer ID (`tr_*`). The Stripe Dashboard URL is constructed based on the ID prefix:
- `pi_*` → `https://dashboard.stripe.com/test/payments/{stripe_id}`
- `ch_*` → `https://dashboard.stripe.com/test/payments/{stripe_id}`
- `tr_*` → `https://dashboard.stripe.com/test/connect/transfers/{stripe_id}`
- When `stripe_id` is null or unrecognized, the link falls back to `https://dashboard.stripe.com/test/payments` (general payments page).

**Campaign name source:** The `PaymentTimeline` component already receives `campaignId` as a prop (declared in the interface but currently unused in the component body — implementation must destructure it). A lightweight `useCampaign(campaignId)` query fetches the campaign title and assigned creator name. Cached by React Query.

### 6. Pending Notification Banner — Dashboard

A dashboard-level component that surfaces campaigns waiting on the current user's action.

**Placement:** Top of the dashboard content area, above the campaign list, below the page header.

**Style:** Amber background (`bg-amber-50 border border-amber-300 rounded-xl`), matching the Pending status banner tone.

**Content:** Names the campaign and the specific action — e.g., "Ricky Ricardo applied to 'Launch Hype Video' 2 days ago — Review Application →"

**CTA:** Links directly to the campaign detail page where the status banner and action CTA are waiting.

**Behavior:**
- Dismissable. Dismissal is stored in `localStorage` keyed by campaign ID: `{ "pendingBannerDismissed_{campaignId}": "{ISO timestamp}" }`. The banner reappears when `Date.now() - dismissedAt > 24 hours` AND the action is still pending. If localStorage is unavailable, the banner always shows (never dismissed).
- If multiple campaigns need attention, banners stack (max 3 visible, then "+ {N} more campaigns need attention" link).
- No new database tables. The component queries existing `campaign_applications` (pending applications older than 24 hours) and `campaign_collaborations` (content submitted but not reviewed) to determine what needs attention.
- Only shown to users whose role is the blocking party (restaurant/brand owners).
- **Loading/error states:** Renders nothing during loading (no skeleton, no placeholder) and nothing on error, to avoid visual jank at the top of the dashboard.

## Components Affected

| Component | Change |
|-----------|--------|
| `CampaignDetailsPage.tsx` | Restructure to render status banner first, then collapsible sections in two-column desktop layout; widen to `lg:max-w-6xl` |
| `CampaignDetailHeader.tsx` | Replace with new `CampaignStatusBanner` component; overflow menu (Edit, Delete, Re-Launch) moves into the banner's kebab menu |
| `EscrowPaymentAlert.tsx` | Absorbed into the "Published — Payment Pending" banner variant; component can be removed |
| `CollapsibleBriefSection.tsx` | Add optional `subtitle?: string` prop for collapsed preview hints |
| `CollapsibleCampaignDetails.tsx` | Refactor — content moves into individual `CollapsibleBriefSection` wrappers |
| `CampaignCard.tsx` | Add Draft CTA ("Edit Draft"), add pink border/bg for action-needed cards, preserve "Pay & Publish" priority for escrow-pending |
| `CampaignsPage.tsx` | Widen to `lg:max-w-6xl`, inline Create button on desktop |
| `PaymentTimeline.tsx` | Add campaign header card with name + Stripe link; destructure `campaignId` prop |
| `PaymentSummaryCards.tsx` | No changes |
| New: `CampaignStatusBanner.tsx` | Status-driven banner component with per-state rendering and overflow menu |
| New: `PendingActionBanners.tsx` | Dashboard notification banners for campaigns awaiting action |

## Data Requirements

No new database tables. All data needed is already present:

- Campaign status, phase, and step: `campaigns` + `campaign_collaborations` tables, derived via `campaignPhase.ts`
- Creator name for banners: `campaign_applications` joined with `profiles`
- Application age for pending notifications: `campaign_applications.created_at`
- Stripe ID for links: `payment_events.stripe_id` (existing nullable column)
- Campaign name for payment timeline: `campaigns.title` fetched via `campaignId` prop
- Dismissal state for pending banners: `localStorage` (client-side only)

## What This Deletes

- Zero-state application stats on Draft campaigns (0/0/0/0 display)
- Separate `EscrowPaymentAlert` component (absorbed into status banner)
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
