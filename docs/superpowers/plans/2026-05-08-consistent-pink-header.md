# Consistent Pink Gradient Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pink gradient header (`bg-gradient-to-b from-dc-pink-bg to-pink-50`) consistently to every in-app page so the theme looks uniform across all roles.

**Architecture:** Create a reusable `PageHeader` component that wraps the page title area with the pink gradient. Apply it to all logged-in pages that currently use white headers (`bg-white border-b border-gray-100`). Exclude auth pages, landing page, public profiles (which have their own hero), and utility pages.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/ui/PageHeader.tsx` | **Create** | Reusable pink gradient header wrapper |
| ~28 page files | **Modify** | Replace white header divs with PageHeader |

### Pages Already HAVE Pink Header (no changes needed — 12 pages)
- `src/pages/BusinessDashboard.tsx` (via DashboardHero)
- `src/pages/CreatorDashboard.tsx` (via DashboardHero)
- `src/pages/BrandDashboard.tsx` (via DashboardHero)
- `src/pages/ROIDashboard.tsx` (inline)
- `src/pages/BrandAnalytics.tsx` (inline)
- `src/pages/BusinessPromotionalTools.tsx` (inline)
- `src/pages/OutstandManager.tsx` (inline)
- `src/pages/CreatorEarnings.tsx` (inline)
- `src/pages/PromotionDetailPage.tsx` (inline)
- `src/pages/CreatorDragonShare.tsx` (teal-to-pink variant — close enough)
- `src/pages/PublicCreatorProfile.tsx` (hero variant)
- `src/pages/PublicBusinessProfile.tsx` (hero variant)

### Pages EXCLUDED (auth, public, utility — 11 pages)
- `src/pages/AuthPage.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/UpdatePassword.tsx`
- `src/pages/VerifyEmail.tsx`
- `src/pages/RestoreAccountPage.tsx`
- `src/pages/ProfileSetup.tsx`
- `src/pages/InviteAcceptPage.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/NotFound.tsx`
- `src/pages/SiteGate.tsx`
- `src/pages/OutstandOAuthCallbackPage.tsx`
- `src/pages/AnonymousCampaignWizard.tsx`
- `src/pages/Index.tsx` (redirect page)

### Pages that NEED the pink header (28 pages across 7 tasks)

**Task 2 — Creator role pages (6 pages):**
- `src/pages/CreatorApplications.tsx` — "My Applications"
- `src/pages/CreatorProjects.tsx` — "My Projects"
- `src/pages/CreatorDragonFeed.tsx` — "My Dragon Feed"
- `src/pages/CreatorCampaignMarketplace.tsx` — "Campaigns"
- `src/pages/CreatorSettings.tsx` — settings (uses ProfileCompletionBar)
- `src/pages/CreatorBrowse.tsx` — browse (uses CreatorBrowseHeader)

**Task 3 — Business role pages (8 pages):**
- `src/pages/BusinessProposals.tsx` — "Proposals"
- `src/pages/BusinessProjects.tsx` — "My Projects"
- `src/pages/BusinessDragonFeed.tsx` — "Dragon Feed"
- `src/pages/BusinessActivity.tsx` — "Inspiration"
- `src/pages/BusinessSponsorships.tsx` — "Sponsorship Proposals"
- `src/pages/BusinessSettings.tsx` — settings (uses ProfileCompletionBar)
- `src/pages/BusinessDragonShare.tsx` — "DragonShare"
- `src/pages/CampaignsPage.tsx` — "Campaigns"

**Task 4 — Brand role pages (5 pages):**
- `src/pages/BrandMessages.tsx` — "Messages"
- `src/pages/BrandCreators.tsx` — "Browse & Sponsor"
- `src/pages/BrandDiscoverCampaigns.tsx` — "Discover Campaigns"
- `src/pages/BrandSponsorships.tsx` — "Brand Sponsorships"
- `src/pages/BrandCreateCampaign.tsx` — "Create Sponsorship Campaign"

**Task 5 — Shared / multi-role pages (5 pages):**
- `src/pages/DirectMessagesPage.tsx` — "Messages"
- `src/pages/CampaignMessagesPage.tsx` — campaign messages
- `src/pages/ReviewsManagement.tsx` — "Reviews & Ratings"
- `src/pages/PaymentsPage.tsx` — "Your Payments"
- `src/pages/DirectConversationPage.tsx` — conversation thread

**Task 6 — Org/admin pages (4 pages):**
- `src/pages/OrgBillingPage.tsx` — "Billing"
- `src/pages/OrgUnitsPage.tsx` — "Your Locations"/"Your Products"
- `src/pages/TeamPage.tsx` — "Team"
- `src/pages/AdminDragonShareLedger.tsx` — "DragonShare Ledger"
- `src/pages/AdminDragonShareQueue.tsx` — "DragonShare Verification Queue"

**Task 7 — Detail/edit pages with teal hero or wizard headers (5 pages):**
- `src/pages/CampaignDetailsPage.tsx`
- `src/pages/BrandCampaignDetails.tsx`
- `src/pages/ProjectDetailsPage.tsx`
- `src/pages/CampaignWizard.tsx`
- `src/pages/CampaignEditPage.tsx`

**Task 8 — Help & promotion pages (4 pages):**
- `src/pages/help/HelpCenter.tsx`
- `src/pages/help/HelpArticlePage.tsx`
- `src/pages/help/promotions/HelpBriefPage.tsx`
- `src/pages/PromotionSubmissionPage.tsx`

---

## Implementation Rules

For every page, the pattern is the same:

1. **Find** the existing header `<div>` (usually `<div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">`)
2. **Replace** that div's classes with the pink gradient: `bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4`
3. **Keep** all children (back button, title, count badge, etc.) — just change the wrapper's background
4. If the page has **no header div at all** (e.g. DragonFeed pages with just a plain div), wrap the title area in the pink gradient div
5. **Never touch** anything below the header — content area stays white

The `PageHeader` component handles the gradient + padding. Each page passes its title content as children.

---

### Task 1: Create the PageHeader Component

**Files:**
- Create: `src/components/ui/PageHeader.tsx`

- [ ] **Step 1: Create the PageHeader component**

```tsx
import type { ReactNode } from 'react';

interface PageHeaderProps {
  children: ReactNode;
}

export function PageHeader({ children }: PageHeaderProps) {
  return (
    <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PageHeader.tsx
git commit -m "feat: add reusable PageHeader component with pink gradient"
```

---

### Task 2: Creator Role Pages (6 pages)

**Files:**
- Modify: `src/pages/CreatorApplications.tsx`
- Modify: `src/pages/CreatorProjects.tsx`
- Modify: `src/pages/CreatorDragonFeed.tsx`
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`
- Modify: `src/pages/CreatorSettings.tsx`
- Modify: `src/pages/CreatorBrowse.tsx`

- [ ] **Step 1: Update CreatorApplications.tsx**

Import `PageHeader` and replace the white header div. Change:
```tsx
<div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
```
To:
```tsx
<PageHeader>
  <div className="flex items-center">
```
And close `</PageHeader>` after the closing `</div>` of the header content. Keep the back button, title, and count badge unchanged.

- [ ] **Step 2: Update CreatorProjects.tsx**

Same pattern — find the `bg-white border-b` header div and replace with `<PageHeader>` wrapper.

- [ ] **Step 3: Update CreatorDragonFeed.tsx**

This page has a simpler header. Wrap the title area in `<PageHeader>`.

- [ ] **Step 4: Update CreatorCampaignMarketplace.tsx**

Find the header area and wrap with `<PageHeader>`.

- [ ] **Step 5: Update CreatorSettings.tsx**

This page has no explicit header — it jumps straight to ProfileCompletionBar. Add a `<PageHeader>` wrapper around the top section containing the ProfileCompletionBar.

- [ ] **Step 6: Update CreatorBrowse.tsx**

This page uses `<CreatorBrowseHeader>` component. Wrap the header area in `<PageHeader>`.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 8: Commit**

```bash
git add src/pages/Creator*.tsx src/pages/CreatorBrowse.tsx
git commit -m "feat: add pink gradient header to all Creator role pages"
```

---

### Task 3: Business Role Pages (8 pages)

**Files:**
- Modify: `src/pages/BusinessProposals.tsx`
- Modify: `src/pages/BusinessProjects.tsx`
- Modify: `src/pages/BusinessDragonFeed.tsx`
- Modify: `src/pages/BusinessActivity.tsx`
- Modify: `src/pages/BusinessSponsorships.tsx`
- Modify: `src/pages/BusinessSettings.tsx`
- Modify: `src/pages/BusinessDragonShare.tsx`
- Modify: `src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Update each page**

For each page, find the white header div (`bg-white border-b border-gray-100`) and replace with `<PageHeader>` wrapper. Keep all children (back buttons, titles, badges) intact.

For BusinessSettings.tsx, same approach as CreatorSettings — wrap the top section in `<PageHeader>`.

For BusinessDragonShare.tsx, which has no explicit header, add a `<PageHeader>` around the title/description area.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/pages/Business*.tsx src/pages/CampaignsPage.tsx
git commit -m "feat: add pink gradient header to all Business role pages"
```

---

### Task 4: Brand Role Pages (5 pages)

**Files:**
- Modify: `src/pages/BrandMessages.tsx`
- Modify: `src/pages/BrandCreators.tsx`
- Modify: `src/pages/BrandDiscoverCampaigns.tsx`
- Modify: `src/pages/BrandSponsorships.tsx`
- Modify: `src/pages/BrandCreateCampaign.tsx`

- [ ] **Step 1: Update each page**

Same pattern — replace white header with `<PageHeader>` wrapper. BrandCreators has a sticky header with campaign selector; keep the sticky behavior but change the background.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/pages/Brand*.tsx
git commit -m "feat: add pink gradient header to all Brand role pages"
```

---

### Task 5: Shared / Multi-Role Pages (5 pages)

**Files:**
- Modify: `src/pages/DirectMessagesPage.tsx`
- Modify: `src/pages/CampaignMessagesPage.tsx`
- Modify: `src/pages/ReviewsManagement.tsx`
- Modify: `src/pages/PaymentsPage.tsx`
- Modify: `src/pages/DirectConversationPage.tsx`

- [ ] **Step 1: Update each page**

Same pattern for all. Replace white header with `<PageHeader>`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/pages/DirectMessagesPage.tsx src/pages/CampaignMessagesPage.tsx src/pages/ReviewsManagement.tsx src/pages/PaymentsPage.tsx src/pages/DirectConversationPage.tsx
git commit -m "feat: add pink gradient header to shared multi-role pages"
```

---

### Task 6: Org/Admin Pages (5 pages)

**Files:**
- Modify: `src/pages/OrgBillingPage.tsx`
- Modify: `src/pages/OrgUnitsPage.tsx`
- Modify: `src/pages/TeamPage.tsx`
- Modify: `src/pages/AdminDragonShareLedger.tsx`
- Modify: `src/pages/AdminDragonShareQueue.tsx`

- [ ] **Step 1: Update each page**

Same pattern. Admin pages may not have explicit headers — add `<PageHeader>` around the title area.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/pages/OrgBillingPage.tsx src/pages/OrgUnitsPage.tsx src/pages/TeamPage.tsx src/pages/AdminDragonShare*.tsx
git commit -m "feat: add pink gradient header to org and admin pages"
```

---

### Task 7: Detail/Edit Pages with Teal Heroes (5 pages)

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`
- Modify: `src/pages/BrandCampaignDetails.tsx`
- Modify: `src/pages/ProjectDetailsPage.tsx`
- Modify: `src/pages/CampaignWizard.tsx`
- Modify: `src/pages/CampaignEditPage.tsx`

These pages currently use teal gradient heroes or wizard-style step headers. The approach here:

- For **CampaignWizard** and **CampaignEditPage**: Replace the white `border-b` header with `<PageHeader>`.
- For **CampaignDetailsPage**, **BrandCampaignDetails**, **ProjectDetailsPage**: These have teal gradient hero sections (`from-dc-teal to-dc-teal-dark`). Replace the teal gradient with the pink gradient (`from-dc-pink-bg to-pink-50`) to match the rest of the app. Keep the overlay content (back button, title, etc.).

- [ ] **Step 1: Update CampaignWizard.tsx and CampaignEditPage.tsx**

Replace white border-b headers with `<PageHeader>`.

- [ ] **Step 2: Update detail pages with teal heroes**

Change `bg-gradient-to-br from-dc-teal to-dc-teal-dark` to `bg-gradient-to-b from-dc-pink-bg to-pink-50` and adjust text colors from white to dark (since pink bg is light).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx src/pages/BrandCampaignDetails.tsx src/pages/ProjectDetailsPage.tsx src/pages/CampaignWizard.tsx src/pages/CampaignEditPage.tsx
git commit -m "feat: add pink gradient header to campaign detail and wizard pages"
```

---

### Task 8: Help & Promotion Pages (4 pages)

**Files:**
- Modify: `src/pages/help/HelpCenter.tsx`
- Modify: `src/pages/help/HelpArticlePage.tsx`
- Modify: `src/pages/help/promotions/HelpBriefPage.tsx`
- Modify: `src/pages/PromotionSubmissionPage.tsx`

- [ ] **Step 1: Update each page**

Wrap the header/title area in `<PageHeader>`. For HelpBriefPage, replace the sticky white header with the pink gradient (keep sticky behavior).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/pages/help/*.tsx src/pages/help/promotions/*.tsx src/pages/PromotionSubmissionPage.tsx
git commit -m "feat: add pink gradient header to help and promotion pages"
```

---

### Task 9: Final Visual QA & Cleanup

- [ ] **Step 1: Run dev server and spot-check pages**

Run: `npm run dev`
Check at least one page per role:
- Creator: `/dashboard/creator/applications`
- Business: `/dashboard/business/projects`
- Brand: `/brand/creators`
- Shared: `/messages`
- Admin: `/admin/dragonshare/ledger`

Verify the pink gradient appears at the top of each page and transitions smoothly to the white content area below.

- [ ] **Step 2: Verify no desktop regressions**

Check the same pages at `lg:` breakpoint (1024px+). Ensure `max-w-2xl lg:max-w-4xl mx-auto` constraints still work properly.

- [ ] **Step 3: Final build check**

Run: `npm run build`
Expected: Clean build, no type errors
