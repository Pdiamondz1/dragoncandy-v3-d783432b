---
title: Campaign Management Overhaul
date: 2026-05-10
status: draft
chunks: 2
---

# Campaign Management Overhaul

Two-chunk redesign addressing six issues on the Restaurant/Brand campaign management experience. Chunk 1 fixes the post-creation lifecycle (project status, reuse, deletion). Chunk 2 fixes the creation UX (CTA clarity, inspiration data source, mobile layout).

## Chunk 1: Campaign Lifecycle Overhaul

### 1A. Project Detail Page Redesign

**Problem:** After a restaurant hires a creator, the "Project Status" button routes to a generic `BusinessProjects` page that doesn't show the campaign name, creator info, or clear next action. The project sits in limbo.

**Solution:** Replace the generic projects list with a campaign-specific Project Detail page that ties the campaign to the assigned creator with a visual progress timeline and a single dynamic CTA.

**Route:** `/dashboard/business/campaigns/:id/project` (replaces the current `/dashboard/business/projects` destination from the campaign card's "Project Status" button).

**Page structure (top to bottom):**

1. **Campaign header card** — campaign title, status badge (Active/Completed), escrow badge (Held/Released), budget/deliverables/deadline summary. White card, rounded-2xl.

2. **Assigned creator card** — avatar (rounded-full with teal ring), creator name, star rating, completed project count. Two action buttons: "Message" (teal fill) and "View Portfolio" (outline, pink text). Teal border on the card (`border-2 border-teal-400`).

3. **Progress timeline** — five steps, each a row with a status indicator circle and label:
   - Creator hired & escrow held (checkmark when done)
   - Content submitted by creator (checkmark when done)
   - Review & approve content (yellow arrow when current)
   - Release payment
   - Leave review
   
   Completed steps: teal circle with white checkmark. Current step: yellow circle with arrow, bold label. Future steps: gray circle with step number, gray label.

4. **Primary CTA** — full-width teal pill button at the bottom. Label changes dynamically based on project state:
   - Waiting for content → "Waiting for Creator to Submit" (disabled/muted)
   - Content submitted → "Review & Approve Content →"
   - Content approved, awaiting mutual completion → "Mark Complete & Release Payment →"
   - Both parties complete → "Leave a Review →"
   - Review left → "Campaign Complete ✓" (non-interactive success state)

**Data source:** Query `campaign_collaborations` joined with `campaigns` and `creator_profiles` where `campaign_id` matches the route param. The page reads `content_status`, `business_completion_status`, `creator_completion_status`, and `status` to derive the current step.

**Files affected:**
- New page: `src/pages/CampaignProjectPage.tsx`
- Modify: `src/components/campaigns/CampaignCard.tsx` — change "Project Status" button route from `/dashboard/business/projects` to `/dashboard/business/campaigns/${campaign.id}/project`
- Modify: `src/App.tsx` — add route for the new page
- New hook: `src/hooks/useCampaignProject.ts` — fetches collaboration + campaign + creator data for the project detail view

### 1B. Campaign Template & Reuse System

**Problem:** No way to re-use a completed campaign. Restaurants must recreate from scratch every time.

**Solution:** Every completed campaign automatically becomes a reusable template. Two entry points for launching from a template.

**How templates are created:** No explicit "save as template" action. When a campaign's status transitions to `completed`, its brief, budget range, platforms, deliverables, delivery tier, and content guidelines are available for duplication. Templates are not a separate database entity — they are completed campaigns queried with a specific filter.

**Entry point 1 — Completed campaign card:** A "Re-Launch Campaign" teal pill button appears on campaign cards with status `completed` in the My Campaigns list. Tapping it calls a `duplicateCampaign` mutation that:
- Copies: title (appended with "(Copy)"), description/brief, budget_min, budget_max, platforms, deliverable types and quantities, delivery_tier, content_guidelines
- Resets: status → `draft`, escrow_status → `pending`, deadline → null, new campaign ID, new created_at
- Does NOT copy: applications, collaborations, invitations, matches, escrow records
- Navigates to the campaign edit page for the new draft so the restaurant can adjust the deadline and any other details before publishing

**Entry point 2 — Create a Campaign page:** A "Your Templates" section appears at the top of the CampaignCreator/DropScreen page when the user has completed campaigns. Horizontally scrollable cards showing campaign title, deliverable summary, and usage count (number of times duplicated, tracked via a `duplicated_from` column on campaigns). Tapping a template card triggers the same `duplicateCampaign` mutation and navigates to edit.

**Usage tracking:** Add a nullable `duplicated_from` UUID column to the `campaigns` table referencing the original campaign ID. This enables the "Used N times" count on template cards via a simple count query.

**Files affected:**
- Modify: `src/components/campaigns/CampaignCard.tsx` — add "Re-Launch Campaign" button for completed campaigns
- New mutation in `src/hooks/useCampaignMutations.ts`: `useDuplicateCampaign`
- New component: `src/components/campaign-creator/TemplateStrip.tsx` — horizontal scrollable template cards for the Create a Campaign page
- New hook: `src/hooks/useCampaignTemplates.ts` — fetches completed campaigns for the current user with duplication counts
- Modify: `src/pages/CampaignCreator.tsx` — add TemplateStrip above the existing DropScreen content
- DB migration: add `duplicated_from` nullable UUID column to `campaigns` table

### 1C. Campaign Deletion Cascade & Notifications

**Problem:** Current deletion only removes the `campaigns` row. Related applications may linger for creators. No notifications sent. Deleted campaigns may still appear on creator/brand views.

**Solution:** Full cascade deletion with a confirmation dialog that shows impact, explicit cleanup of related records, and notifications to all affected parties.

**Confirmation dialog:** Before deletion, show a modal with:
- Campaign title
- Count of pending applications that will be cancelled
- Count of pending invitations that will be withdrawn
- Warning that the action cannot be undone
- Two buttons: "Cancel" (outline) and "Delete Campaign" (red fill)

**Cascade logic (in the mutation, before deleting the campaign row):**
1. Query `campaign_applications` for this campaign to get list of applicant user IDs
2. Query `campaign_invitations` for this campaign to get list of invited user IDs
3. Delete from `campaign_applications` where `campaign_id` matches
4. Delete from `campaign_invitations` where `campaign_id` matches
5. Delete from `campaign_matches` where `campaign_id` matches
6. Delete from `campaign_sponsorships` where `campaign_id` matches AND no payment has been made
7. Delete the `campaigns` row
8. Send notifications to all collected user IDs

**Notification mechanism:** Use `supabase.functions.invoke('send-notification-email')`, matching the existing pattern in `useCampaignMutations.ts` for campaign publish notifications. Look up each affected user's email and name from `profiles`.

**Notification content:**
- Creator notification: "'{campaign_title}' by {business_name} has been cancelled. Your application has been removed." With CTA: "Browse Other Campaigns" linking to campaign discovery.
- Brand notification: "'{campaign_title}' by {business_name} has been cancelled. Your sponsorship invitation has been withdrawn." With CTA: "View Active Campaigns."

**Deletion guards (enforced in UI and mutation):**
| Campaign state | Can delete? | Reason |
|---|---|---|
| Draft (no applications) | Yes | No impact — silent delete, no notifications |
| Published (pending apps) | Yes | Apps cancelled, creators/brands notified |
| Active (creator hired) | No | Must complete or cancel collaboration first |
| Escrow held (no hire) | No | Must refund escrow first |
| Completed | Yes | Historical — template preserved separately via duplicated_from references |

**Files affected:**
- Modify: `src/hooks/useCampaignMutations.ts` — rewrite `useDeleteCampaign` with cascade logic and notification dispatch
- New component: `src/components/campaigns/DeleteCampaignDialog.tsx` — confirmation modal showing impact
- Modify: `src/components/campaigns/CampaignCard.tsx` — wire delete button to the new dialog instead of direct deletion
- Modify deletion guard: add escrow_status check (`canDelete` should also require `escrow_status !== 'held'` unless there's an accepted creator)

## Chunk 2: Campaign Creation UX Polish

### 2A. Replace "+" Icon with "Create a Campaign" Button

**Problem:** The "+" icon in the top-right of the My Campaigns page header is cryptic. New users don't know what it means.

**Solution:** Remove the "+" icon button from the header. Add a full-width teal pill button below the page title that reads "Create a Campaign."

**Button spec:**
- Full-width (`w-full`)
- Teal fill (`bg-teal-400`)
- White bold text (`text-white font-bold`)
- Pill shape (`rounded-full`)
- Padding: `py-3`
- Text: "Create a Campaign"
- Same `onClick` / navigation as the current "+" button (routes to `/dashboard/business/campaigns/create`)

**Placement:** Below the "CAMPAIGNS" page title, above the status filter tabs (All / Draft / Published / Active / Completed / Cancelled).

**Files affected:**
- Modify: `src/pages/CampaignsPage.tsx` — remove the "+" icon button from the header area (lines ~118-124), add full-width button below the title

### 2B. InspirationStrip → Your Liked Content

**Problem:** The "Inspiration from creators" section on the Create a Campaign page pulls random creator portfolio content. This is not personalized and provides no real inspiration value.

**Solution:** Rename the section to "Your Liked Content" and change the data source to only show content the user has explicitly liked/hearted on the DragonFeed.

**Section header:** "❤️ Your Liked Content" with subtitle "From your DragonFeed — Donny uses it as a style reference"

**Data source change:** The current `useInspirationStrip` hook queries `creator_profiles` with `allow_portfolio_in_feed = true` and resolves portfolio URLs. Replace this with a query against `analytics_events` where:
- `user_id` = current user
- `event_type` = `dragon_feed_like`
- The `event_data` JSONB column contains `content_id` — join back to the content source to get the media URL, creator name, and thumbnail

The selected items are still passed to the `donny-campaign-generate` edge function as `inspirationRefs` — this behavior doesn't change.

**Empty state:** When the user has no liked content, show:
- Dragon icon (🐉)
- Text: "Like content on the DragonFeed to use as style inspiration here"
- CTA button: "Explore DragonFeed" (teal pill) linking to the DragonFeed page

**Each content card shows:**
- Square thumbnail (image or video poster)
- Heart badge (❤️) in top-left corner
- Creator handle in bottom-left corner over the image

**Files affected:**
- Modify: `src/hooks/useInspirationStrip.ts` — change query from `creator_profiles` portfolio to `analytics_events` likes
- Modify: `src/components/campaign-creator/InspirationStrip.tsx` — update title, add subtitle, add empty state, update card rendering to show heart badge and creator handle

### 2C. Mobile Layout Fix for Liked Content Cards

**Problem:** On mobile, the InspirationStrip content items don't display correctly. They compress to fit the viewport instead of maintaining fixed dimensions and scrolling horizontally like they do on desktop.

**Root cause:** The content items lack `flex-shrink: 0` and fixed width/height on mobile viewports. The flex container compresses children to fit.

**Fix:** Apply these Tailwind classes:
- Container: `flex overflow-x-auto gap-2` (already mostly correct, ensure `overflow-x-auto` is present)
- Each item: `w-[90px] h-[90px] flex-shrink-0 rounded-xl` on mobile, scaling up on desktop (`lg:w-[120px] lg:h-[120px]`)
- Add `object-cover` on images/videos within the cards to maintain aspect ratio

This ensures mobile renders identically to desktop — square cards in a horizontally scrollable row.

**Files affected:**
- Modify: `src/components/campaign-creator/InspirationStrip.tsx` — add `flex-shrink-0` and fixed dimensions to each item, ensure container has `overflow-x-auto`

## Execution Order

**Chunk 1 first, then Chunk 2.** Within each chunk, the order is:

**Chunk 1:**
1. 1A — Project Detail Page (new page, new hook, route change)
2. 1B — Template & Reuse System (new mutation, new component, DB migration)
3. 1C — Deletion Cascade (rewrite mutation, new dialog, notification logic)

**Chunk 2:**
1. 2A — Create a Campaign button (single file change)
2. 2B — InspirationStrip data source (hook + component change)
3. 2C — Mobile layout fix (CSS-only change in same component)

Each sub-task is independently shippable and should be verified with `npm run build` before moving to the next.

## What This Deletes, Simplifies, and Automates

**Deletes:**
- The cryptic "+" icon
- The generic BusinessProjects page as the project status destination
- Random portfolio content in InspirationStrip
- Ghost campaign listings that linger after deletion

**Simplifies:**
- Project management: one page, one timeline, one CTA — zero guesswork
- Campaign reuse: tap "Re-Launch" on any completed campaign
- Deletion: one confirmation dialog shows full impact, cascade handles cleanup

**Automates:**
- Template creation: every completed campaign is automatically reusable
- Deletion notifications: all affected creators and brands notified without manual outreach
- Progress tracking: timeline auto-advances based on collaboration state

**Keystrokes removed:**
- Re-launching a campaign: from ~50+ (recreate from scratch) to 2 (tap Re-Launch, set deadline)
- Understanding project status: from ~5 (navigate, scan, guess) to 0 (land on page, see timeline + CTA)
