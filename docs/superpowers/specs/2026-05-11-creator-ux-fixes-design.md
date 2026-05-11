# Creator UX Fixes — Design Spec

> Date: 2026-05-11
> Author: Dame + Claude
> Status: Approved (brainstorming)

## Summary

Three independent fixes targeting creator-side UX issues discovered during
live testing with the `damewillie@gmail.com` creator account. Each fix is
self-contained and can be shipped independently.

---

## Fix 1: Projects Page Crash — RLS Policy + Null Guards + Revision Feedback Wiring

### Problem

The Creator Projects page (`/projects`) crashes with "Something went wrong"
(ErrorBoundary catch). Root cause: the `campaigns` table RLS SELECT policy
only allows reading campaigns where `user_id = auth.uid()` (business owns
it) OR `status = 'published'`. When a campaign transitions out of
`published` (e.g., to `active` after a collaboration starts), the creator
loses read access. The left join in `CreatorProjects.tsx` returns `null` for
the campaign data, and `ProjectCard.tsx` accesses `project.campaigns.title`
without null guards — TypeError.

Secondary issue: the post-hire collaboration workflow (upload, submit,
revision, approval, payout) is fully built but completely inaccessible to
creators due to this crash. Additionally, per-deliverable revision feedback
from businesses is not wired to the creator-side deliverable cards — the
`DeliverableCard` component accepts a `feedback` prop but
`ProjectDetailsPage.tsx` never passes it.

### Design

**1a. RLS migration** — Replace the campaigns SELECT policy:

```sql
DROP POLICY "Users can view own campaigns or published campaigns" ON campaigns;
CREATE POLICY "Users can view accessible campaigns" ON campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR status = 'published'
  OR EXISTS (
    SELECT 1 FROM campaign_collaborations
    WHERE campaign_collaborations.campaign_id = campaigns.id
      AND campaign_collaborations.creator_id = auth.uid()
  )
);
```

This grants read access to any campaign the creator has a collaboration on,
regardless of campaign status. Prevents the same class of bug from
surfacing in future queries that join creators to campaigns through
collaborations.

**1b. Null guards** — In `ProjectCard.tsx`, add null checks on
`project.campaigns` before accessing `.title`, `.delivery_type`, etc. If
null, render a fallback card (e.g., "Campaign unavailable") instead of
crashing. Update the `ProjectCollaboration` type in `CreatorProjects.tsx`
to mark `campaigns` as potentially nullable.

**1c. Revision feedback wiring** — In `ProjectDetailsPage.tsx`, pass
per-deliverable feedback data from `collaboration.deliverables_status` into
each `DeliverableCard`'s `feedback` prop. When a business requests
revisions through `RevisionRequestModal` (which collects per-deliverable
notes), the creator should see that feedback directly on the corresponding
deliverable card — not just a generic "Check your messages" alert.

### Files touched

- New Supabase migration (RLS policy update on `campaigns`)
- `src/components/projects/ProjectCard.tsx` — null guards
- `src/pages/CreatorProjects.tsx` — type adjustment for nullable campaigns
- `src/pages/ProjectDetailsPage.tsx` — wire feedback prop to DeliverableCard

### Risks

- The RLS policy adds a subquery with `EXISTS` on `campaign_collaborations`.
  This table is indexed on `(campaign_id, creator_id)` so the subquery
  should be fast. Monitor query performance post-deploy.
- The null guard is defense-in-depth. After the RLS fix, campaigns should
  never be null for active collaborations. The guard exists for edge cases
  (deleted campaigns, race conditions).

---

## Fix 2: Pending Application Status — Context Message

### Problem

All campaign applications for the creator show "Pending" with a yellow badge
and no further context. The application lifecycle is entirely manual —
applications stay in `pending` until the business owner explicitly accepts,
rejects, or counter-offers. There is no auto-progression. The creator has
zero visibility into why an application is pending or how long it has been
waiting.

### Design

In `DetailedApplicationCard.tsx`, add a contextual block below the
`ApplicationStatusBadge` when status is `pending`:

- **Message**: "Awaiting business review" in muted gray text (`text-sm
  text-gray-500`)
- **Time indicator**: Relative time since `created_at` — "Applied today",
  "Applied yesterday", "Applied 3 days ago", "Applied 2 weeks ago"
- Positioned directly under the Pending badge, immediately visible without
  scrolling

No new database columns or queries required. The `created_at` timestamp
already exists on every `campaign_applications` row. The message sets the
creator's expectation that the ball is in the business's court, and the time
indicator provides a sense of whether the wait is normal or overdue.

### Files touched

- `src/components/applications/DetailedApplicationCard.tsx` — add context
  message and relative time indicator for pending status

### Risks

- Minimal. Text-only UI addition, no data model changes.

---

## Fix 3: Remove Social/Outstand Prerequisite for Creators

### Problem

The `PrerequisiteGate` component blocks creators from applying to campaigns,
using DragonShare, and submitting promotions until they connect a social
media account via Outstand. Most creators have personal social accounts (not
business accounts), making Outstand's OAuth flow inapplicable. This gates
core revenue-generating features behind a requirement that doesn't match the
creator user base.

The "Almost there!" card (rendered by `PrerequisiteGate.tsx`) enforces three
prerequisites: profile complete, social connected (Outstand), and Stripe
setup. The social check queries the `business_outstand_accounts` table via
the `check_prerequisite_status` RPC.

### Design

**3a. Frontend hook** — In `usePrerequisiteStatus.ts`, when building the
prerequisite items array, skip the `social` item when the user's role is
`content_creator`. Businesses and brands continue to see the social
requirement. The creator gate drops from 3 items to 2: profile complete +
Stripe setup.

**3b. RPC update** — In the `check_prerequisite_status` SQL function, return
`social_connected: true` for users with `content_creator` role. This keeps
the backend consistent with the frontend — any code path reading the RPC
result for a creator will not falsely report a missing prerequisite.

The "Almost there!" card still renders for creators who haven't completed
profile or Stripe. It just won't include the social media step. Once profile
and Stripe are done, the gate opens fully.

### Files touched

- `src/hooks/usePrerequisiteStatus.ts` — filter out `social` item for
  `content_creator` role
- New Supabase migration — update `check_prerequisite_status` RPC to return
  `social_connected: true` for `content_creator` role

### Risks

- If a future feature requires creators to have connected social accounts,
  the gate will need to be re-enabled. This is a deliberate tradeoff —
  don't block launch features on a requirement most creators can't fulfill.
- Businesses and brands still require Outstand social connection. This is
  intentional — they are more likely to have business social accounts.

---

## What This Deletes

- The social/Outstand requirement for creators (one fewer onboarding step)
- The generic "Check your messages" fallback for revision feedback (replaced
  with inline per-deliverable notes)

## What This Simplifies

- Creator Projects page: works instead of crashing
- Pending applications: one glance tells the creator the status and duration
- PrerequisiteGate for creators: 2 steps instead of 3

## What This Automates

- Nothing. These are all manual-flow fixes. Automation comes after the
  process works correctly (Musk's Algorithm step 5).

## Keystroke Count Removed

- Social connect flow for creators: ~15-20 taps/clicks eliminated (navigate
  to settings → social section → Outstand OAuth → authorize → return)
