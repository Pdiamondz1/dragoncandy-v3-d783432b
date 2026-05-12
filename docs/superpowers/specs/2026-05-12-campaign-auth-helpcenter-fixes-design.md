# Campaign, Auth, and Help Center Fixes — Design Spec

> Date: 2026-05-12
> Status: Approved
> Scope: 6 issues across campaign UX, creator dashboard, auth flow, and Help Center

## Overview

Six interconnected fixes addressing data integrity issues in campaign views,
styling inconsistencies in the Creator experience, a critical auth lockout
bug, and a comprehensive Help Center content refresh. Each fix follows the
Musk Algorithm: question the requirement, delete what's unnecessary, simplify
what remains.

---

## 1. Campaign Content Review Fix (Restaurant/Business View)

### Problem

The `ContentReviewSection.tsx` component shows a "Content Ready For Your
Review" banner with Review & Approve / Request Revision buttons based solely
on the collaboration status being `content_submitted`. When no actual files
have been uploaded by the creator, the restaurant user sees approve buttons
with nothing to approve.

### Solution

**A. Guard the "ready for review" state.**

Query `file_uploads` for deliverables linked to the collaboration. If no
files exist, suppress the "Content Ready" banner and approve/revision
buttons. Instead display: "Waiting for [Creator Name] to upload content"
with a subtle progress indicator.

**B. Add a visible content preview gallery.**

When files exist, render them prominently above the approve/revision buttons:
- Image thumbnails at viewable size (not icon-size)
- Video files with play button overlay
- Other file types with download links
- Lightbox for full-size viewing on click

### Files Affected

- `src/components/campaigns/detail/ContentReviewSection.tsx` — guard logic +
  preview gallery
- `src/hooks/useFileUploads.ts` — ensure deliverable query covers the
  collaboration scope

### What This Deletes

The misleading "Content Ready" state when nothing is uploaded. Removes
confusion of approve buttons with no content to review.

---

## 2. Creator Dashboard "Unknown Campaign" Entries

### Problem

In `useCreatorRecentActivity.ts`, queries for applications and
collaborations join on the `campaigns` table. When a campaign is deleted,
the join returns null and the hook falls back to displaying "Unknown
Campaign" — cluttering the creator's recent activity with non-actionable
ghost entries.

### Solution

Filter out orphaned records at the query level. After fetching applications
and collaborations, exclude any entries where the campaign title is null.
One-line filter on each data array before merging into the activity feed.

### Files Affected

- `src/hooks/useCreatorRecentActivity.ts` — add null-campaign filter on
  both applications and collaborations arrays

### What This Deletes

Ghost entries from deleted campaigns. Recent activity becomes a clean view
of real, live campaign engagement.

---

## 3. Creator My Campaigns Page Styling + Layout

### Problem

`MyCampaignsPage.tsx` renders as a standalone full-width page with
`bg-gradient-to-b from-pink-200 to-pink-100` and a custom header. Missing
`DashboardLayout` wrapper means no sidebar nav on desktop, no consistent
navigation on mobile, and a pink background that doesn't match other
Creator dashboard pages.

### Solution

- Wrap page content in `DashboardLayout userRole="content_creator"`
- Replace pink gradient background with `bg-white`
- Remove the custom back-arrow header (DashboardLayout provides navigation)
- Preserve internal content: earnings cards, Applied/Active/Done tabs,
  campaign cards

### Files Affected

- `src/pages/MyCampaignsPage.tsx` — wrapper change, background swap, header
  removal

### What This Deletes

Pink gradient background, inconsistent standalone layout, redundant custom
header. Page matches the rest of the Creator dashboard.

---

## 4. Remove "D" Avatar from Available Campaigns

### Problem

`CreatorCampaignMarketplace.tsx` lines 125-129 render a teal-ringed circular
badge showing the first letter of the user's email. No click handler, no
dropdown, no functionality. The profile avatar is already in the top nav.

### Solution

Delete the avatar badge element entirely. No layout shift — remaining
content is left-aligned.

### Files Affected

- `src/pages/CreatorCampaignMarketplace.tsx` — remove avatar badge JSX
  (lines 125-129)

### What This Deletes

A meaningless decorative element that looks interactive but isn't.

---

## 5. Auth — Password Reset Before Email Verification

### Problem

When a user signs up, `email_verified` defaults to `false`. If the user
resets their password before clicking the verification link:

1. Password reset succeeds (Supabase Auth level)
2. User tries to log in with new password
3. `AuthPage.tsx:85-90` checks `email_verified`, finds `false`
4. App signs them out with "verify your email" error
5. No way to re-trigger verification — account is permanently locked out

### Solution

**A. Auto-verify on successful password reset.**

In `UpdatePassword.tsx`, after `supabase.auth.updateUser({ password })`
succeeds, also set `email_verified = true` in the user's profile. Proof of
email ownership via password reset link is equivalent to clicking the
verification link — requiring both is a redundant gate.

**B. Resend verification link on login failure.**

In `AuthPage.tsx`, when the `email_verified` check fails, add a "Resend
verification email" button below the error message. Triggers the
`send-verification-email` edge function. Covers edge cases: delayed emails,
expired tokens, any other scenario where verification gets stuck.

### Files Affected

- `src/pages/UpdatePassword.tsx` — add `email_verified = true` update after
  successful password change
- `src/pages/AuthPage.tsx` — add resend verification button in the
  `email_verified` error branch
- `src/components/auth/AuthForm.tsx` — may need to expose the
  send-verification-email trigger as a shared utility

### What This Deletes

The account lockout trap entirely. Deletes a redundant verification step for
password-reset users. Deletes a class of support requests.

---

## 6. Help Center Content Refresh + Screenshots

### Problem

The Help Center has 18 database-seeded articles across 5 categories, all
text-only with no images. Content was written at seed time and doesn't
reflect the current platform features. New users across all three roles
(creator, restaurant, brand) lack visual guidance for understanding the
platform.

### Solution

**A. Add two new categories.**

Expand from 5 to 7 categories:

| Category | Icon | Purpose |
|----------|------|---------|
| Getting Started | BookOpen | Existing — updated |
| Campaigns | Megaphone | Existing — updated |
| DragonShare | Zap | Existing — updated |
| Billing & Plans | CreditCard | Existing — updated |
| Account & Privacy | Shield | Existing — updated |
| Donny AI | Sparkles | **New** — match scores, suggestions, help briefs, insights |
| Messaging | MessageCircle | **New** — conversations, file sharing, real-time presence |

Update the `help_articles` table's category options and the category icon
mapping in `HelpCenter.tsx`.

**B. Full article content rewrite.**

Rewrite all 18 existing articles and write 6-10 new articles for Donny AI
and Messaging categories. Target: 24-28 total articles.

Each article follows a consistent structure:
- What the feature does (1-2 sentences)
- How to use it (numbered steps)
- Tips or things to know
- Inline screenshots with captions

Articles are written from the perspective of the target role(s) using the
existing `roles` array field for filtering.

**C. Live screenshots via browser automation.**

Capture screenshots from dragoncandy.io for each article topic:
- Dashboard views per role
- Campaign creation flow
- Messaging UI
- Donny AI features (match scores, suggestions)
- Content delivery and review flow

Screenshots uploaded to Supabase Storage in a `help-screenshots` bucket.
Referenced in article body HTML as `<img>` tags with Tailwind classes
(`rounded-xl shadow-md my-4 max-w-full`).

Role-specific screenshots where relevant (creator vs restaurant vs brand
views of the same feature).

### Files Affected

- `src/pages/help/HelpCenter.tsx` — add new category icons + enum entries
- `supabase/migrations/` — new migration to update category options and
  seed updated article content
- Supabase Storage — `help-screenshots` bucket creation + image uploads
- `src/pages/help/HelpArticlePage.tsx` — verify img tags render correctly
  within prose styling (may need minor CSS adjustment for image sizing)

### What This Deletes

Outdated text that doesn't match the current UI. Removes the gap between
what users see in the app and what help articles describe. Deletes the
"figure it out yourself" burden on new users.

---

## Implementation Order

These six fixes are independent and can be implemented in any order, but
the recommended sequence is:

1. **Auth fix** (Issue 5) — critical bug, unblocks locked-out users
2. **Unknown Campaign filter** (Issue 2) — quick data fix
3. **Remove "D" avatar** (Issue 4) — quick UI cleanup
4. **My Campaigns styling** (Issue 3) — layout consistency
5. **Campaign content review** (Issue 1) — UX improvement with new gallery
6. **Help Center refresh** (Issue 6) — largest scope, can run in parallel
   with issues 1-5

## Out of Scope

- Changes to campaign status state machine (how `content_submitted` gets
  set) — this spec only addresses the UI guard
- Stripe payment flow modifications
- New Help Center features (search improvements, Donny AI chat integration)
  — content update only
- Social media integration references in help articles (not yet launched)
