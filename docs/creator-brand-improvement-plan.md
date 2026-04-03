# Creator & Brand Experience Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Creator and Brand role experiences to the same level of polish as the Business/Restaurant dashboard, fixing loading states, hardcoded copy, broken UX, and unconnected features across all Creator-facing and Brand-facing pages.

**Architecture:** Targeted, isolated fixes — each prompt touches the minimum set of files needed. No speculative abstractions. Fixes are grouped by theme (loading states, copy, broken features, styling) so the app improves incrementally and is always in a shippable state.

**Tech Stack:** React + TypeScript, Tailwind CSS, React Query (TanStack), Supabase JS v2, shadcn/ui components, Lucide React icons.

---

## Audit Summary

### What looks good (Business/Restaurant reference quality)
- `BusinessDashboard.tsx` — clean layout, `DonnyAskBar`, extracted `BusinessStatsRow` + `ActiveCampaignsFeed`, proper loading spinner, `RatingPromptManager`
- `CreatorDashboard.tsx` — largely polished: teal-bordered stats grid, activity + deadline sections, Donny AI bar
- `CreatorApplications.tsx` — good structure with stats, search, and tabbed content
- `CreatorProjects.tsx` — good skeleton loading, proper error state, tab navigation

### Issues found (verified by code review)

| File | Line(s) | Issue | Severity |
|------|---------|-------|----------|
| `BrandDashboard.tsx` | 21 | Bare `<div>Loading...</div>` — no layout wrapper, no spinner | HIGH |
| `BrandDashboard.tsx` | 54, 61, 79, 83, 90, 159 | Hardcoded "restaurant" language throughout Brand experience | HIGH |
| `BrandSponsorships.tsx` | 46 | Bare `<div>Loading...</div>` — no layout, no spinner | HIGH |
| `BrandSettings.tsx` | 186–207 | Notification checkboxes are `defaultChecked` but not controlled — state changes don't save | HIGH |
| `BrandSponsorships.tsx` | 149–151 | Pay button uses off-brand `from-pink-600 to-purple-600` gradient | MEDIUM |
| `BrandAnalytics.tsx` | — | No error state when `useBrandAnalytics` fails | MEDIUM |
| `BrandDiscoverCampaigns.tsx` | 189–243 | Sponsorship form uses `Dialog` (modal) instead of `Sheet` (bottom sheet) — inconsistent with rest of app | MEDIUM |
| `CreatorDashboard.tsx` | 25–27 | Bare `<div>Loading...</div>` — no layout wrapper | MEDIUM |
| `CreatorProjects.tsx` | 53, 78 | `console.log` debug artifacts in production query function | LOW |
| `CreatorApplications.tsx` | 47–55 | Error state missing icon — just text, no visual | LOW |
| `CreatorCampaignMarketplace.tsx` | 131–135 | Desktop empty state uses raw `<p>` tags, no card/border styling | LOW |
| `PublicCreatorProfile.tsx` | 80 | Uses `select('*')` — violates CLAUDE.md rule about avoiding `select *` in production | LOW |
| `BrandMessages.tsx` | 31 | Loading state renders "Loading..." inside styled card — should be a spinner | LOW |

---

## Prompt 1 — Fix bare loading states across Brand + Creator pages

**Files to modify:**
- `src/pages/BrandDashboard.tsx`
- `src/pages/BrandSponsorships.tsx`
- `src/pages/CreatorDashboard.tsx`
- `src/pages/BrandMessages.tsx`

**What's broken:**

Each page has a guard like:
```tsx
if (!profile) {
  return <div>Loading...</div>;
}
```
This renders a blank or unstyled screen on slow connections, with no layout or branding. The Business dashboard has the same issue but the user says it looks good — so this is a consistency fix for the creator/brand variants.

**Fix for `BrandDashboard.tsx` (line 20–22):**
```tsx
// REMOVE:
if (!profile) {
  return <div>Loading...</div>;
}

// REPLACE WITH:
if (!profile) {
  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
      </div>
    </DashboardLayout>
  );
}
```
Ensure `Loader2` is already imported (it is).

**Fix for `BrandSponsorships.tsx` (line 45–47):**
```tsx
// REMOVE:
if (!profile) {
  return <div>Loading...</div>;
}

// REPLACE WITH:
if (!profile) {
  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
      </div>
    </DashboardLayout>
  );
}
```
`Loader2` is already imported in BrandSponsorships.

**Fix for `CreatorDashboard.tsx` (line 25–27):**
```tsx
// REMOVE:
if (!profile) {
  return <div>Loading...</div>;
}

// REPLACE WITH:
if (!profile) {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
      </div>
    </DashboardLayout>
  );
}
```
Add `Loader2` to the lucide-react import at line 13.

**Fix for `BrandMessages.tsx` (line 30–37):**
```tsx
// REMOVE the loading state body content (the styled div with "Loading..."):
<div className="border-2 border-dc-teal rounded-2xl p-4 bg-white text-center text-sm text-gray-500">
  Loading...
</div>

// REPLACE WITH:
<div className="flex items-center justify-center h-40">
  <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
</div>
```
Add `Loader2` to imports.

- [ ] Open `BrandDashboard.tsx`, apply the loading state fix
- [ ] Open `BrandSponsorships.tsx`, apply the loading state fix
- [ ] Open `CreatorDashboard.tsx`, add `Loader2` to import and apply fix
- [ ] Open `BrandMessages.tsx`, add `Loader2` to import and apply loading body fix
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: replace bare Loading... divs with styled spinner states across creator/brand pages`

---

## Prompt 2 — Remove hardcoded "restaurant" language from Brand dashboard

**Files to modify:**
- `src/pages/BrandDashboard.tsx`

**What's broken:**

The Brand role is for general sponsor brands (apparel, beverage, etc.), but the dashboard copy was written assuming the Brand is always talking to restaurants. This is confusing for any brand sponsor that isn't a restaurant context.

**Lines and fixes:**

Line 54 — in `quickActions` array:
```tsx
// CHANGE:
description: "Browse restaurant campaigns seeking brand partnerships",
// TO:
description: "Browse campaigns open for brand sponsorships",
```

Line 61 — in `quickActions` array:
```tsx
// CHANGE:
description: "Find local content creators for brand collaborations",
// TO:
description: "Find content creators for your brand collaborations",
```

Line 79 — in `howItWorksSteps` array:
```tsx
// CHANGE:
description: "Browse local restaurant campaigns and creators seeking brand partnerships"
// TO:
description: "Browse campaigns and creators seeking brand partnerships"
```

Line 83 — in `howItWorksSteps` array:
```tsx
// CHANGE:
description: "Choose campaigns that align with your brand values and target audience"
// (this line is already fine, no change needed)
```

Line 90 — in `howItWorksSteps` array:
```tsx
// CHANGE:
description: "Work with restaurants and creators to develop authentic branded content"
// TO:
description: "Work with businesses and creators to develop authentic branded content"
```

Line 159 — in the main CTA:
```tsx
// CHANGE:
description: "Find restaurant campaigns and local creators that align with your brand values"
// TO:
description: "Find campaigns and creators that align with your brand values"
```

- [ ] Open `BrandDashboard.tsx`, apply all 5 copy fixes above
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: remove hardcoded restaurant language from Brand dashboard copy`

---

## Prompt 3 — Fix BrandSettings notification preferences (uncontrolled → remove dead UI)

**Files to modify:**
- `src/pages/BrandSettings.tsx`
- `src/hooks/useBrandSettings.ts` (if notification mutation is added)

**What's broken:**

Lines 186–207: Three checkboxes use `defaultChecked` but are completely uncontrolled — no `checked` state, no `onChange`, and no mutation. The user can toggle them but the value is never saved. This is a broken feature that looks functional.

**The simplest correct fix** (no backend changes required):

Remove the entire "Notification Preferences" section from `BrandSettings.tsx` until it's properly implemented. This is better UX than leaving in a section that silently does nothing.

```tsx
// REMOVE lines 175–209 entirely:
{/* Notification Preferences Section */}
<div>
  <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Notification Preferences</p>
  <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-4">
    ... (all 3 checkboxes)
  </div>
</div>
```

**Alternative: wire it up properly** (if notification_preferences table is available):

Add controlled state and a mutation in `useBrandSettings.ts`:
```tsx
// In BrandSettings.tsx, add to the formData state:
const [notifications, setNotifications] = useState({
  proposal_updates: true,
  campaign_opportunities: true,
  performance_reports: true,
});

// Replace defaultChecked checkboxes with:
<input
  type="checkbox"
  checked={notifications.proposal_updates}
  onChange={(e) => setNotifications(n => ({ ...n, proposal_updates: e.target.checked }))}
  className="w-5 h-5 accent-dc-teal"
/>
// (repeat for other checkboxes)

// Add a save button for this section
<Button
  onClick={() => saveNotifications(notifications)}
  className="w-full rounded-full bg-dc-teal text-white font-bold py-3 h-auto hover:bg-dc-teal/90 mt-3"
>
  Save Preferences
</Button>
```

**Decision:** If `notification_preferences` table exists and has a `brand` user row, implement Option 2. Otherwise, implement Option 1 (remove the section). Check by running:
```bash
grep -r "notification_preferences" src/
```
If no hits, go with Option 1 (remove).

- [ ] Run: `grep -r "notification_preferences" src/` to check if the table is used
- [ ] If no existing hook: remove the Notification Preferences section entirely from `BrandSettings.tsx`
- [ ] If hook exists: wire up controlled inputs and add a save button
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: remove/fix broken notification preferences UI in BrandSettings`

---

## Prompt 4 — Fix BrandSponsorships pay button off-brand gradient

**Files to modify:**
- `src/pages/BrandSponsorships.tsx`

**What's broken:**

Line 149–151: The "Pay $X" button uses a purple gradient that is completely off-brand:
```tsx
className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
```
The design system uses teal (`dc-teal`) for primary CTAs. Purple is not part of the DragonCandy palette.

**Fix:**
```tsx
// CHANGE:
className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"

// TO:
className="rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-bold"
```

- [ ] Open `BrandSponsorships.tsx` line ~149, find the pay button
- [ ] Replace the gradient class with the teal pill button pattern
- [ ] Visually verify the button now renders in teal
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: replace off-brand purple gradient on BrandSponsorships pay button`

---

## Prompt 5 — Add error state to BrandAnalytics

**Files to modify:**
- `src/pages/BrandAnalytics.tsx`
- `src/hooks/useBrandAnalytics.ts` (read only, to confirm error shape)

**What's broken:**

`BrandAnalytics.tsx` handles loading and data, but has no `isError` branch. If `useBrandAnalytics` fails, the page silently shows blank analytics cards with zeros and no explanation.

**Current code at line 8:**
```tsx
const { data: analytics, isLoading } = useBrandAnalytics();
```

**Fix:**
```tsx
// Step 1: Destructure isError:
const { data: analytics, isLoading, isError } = useBrandAnalytics();

// Step 2: Add error state below isLoading block (around line 66):
// AFTER:
) : (
  <>
    {/* Stats grid */}

// ADD before the stats grid (inside the else branch):
{isError ? (
  <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
    <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
    <h3 className="font-bold text-gray-900 mb-2">Unable to load analytics</h3>
    <p className="text-sm text-gray-500">There was a problem fetching your analytics data. Please refresh the page.</p>
  </div>
) : (
  <>
    {/* existing stats grid and sections */}
  </>
)}
```

Add `AlertCircle` to the lucide-react import (already has `BarChart3, TrendingUp, DollarSign, Target, Eye, Loader2`).

- [ ] Open `BrandAnalytics.tsx`
- [ ] Destructure `isError` from `useBrandAnalytics()`
- [ ] Add `AlertCircle` to the lucide import
- [ ] Wrap the existing content grid in an `isError ? <error state> : <content>` block
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: add error state to BrandAnalytics page`

---

## Prompt 6 — Fix BrandDiscoverCampaigns sponsorship form: Dialog → Sheet

**Files to modify:**
- `src/pages/BrandDiscoverCampaigns.tsx`

**What's broken:**

Lines 189–243: The sponsorship proposal form uses a `Dialog` (centered modal overlay). The rest of the app uses `Sheet` with `side="bottom"` for mobile action flows (see `CreatorCampaignMarketplace.tsx` lines 211–231 as reference). A centered modal on mobile feels jarring and doesn't match the app's interaction pattern.

**Fix — replace Dialog with Sheet:**

```tsx
// REMOVE Dialog imports:
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ADD Sheet imports (these are already in the project):
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

// CHANGE the JSX (lines 189-243):
// FROM:
<Dialog open={showSponsorDialog} onOpenChange={setShowSponsorDialog}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Sponsor Campaign</DialogTitle>
      <DialogDescription>
        Submit a sponsorship proposal for "{selectedCampaign?.title}"
      </DialogDescription>
    </DialogHeader>
    ...form content...
  </DialogContent>
</Dialog>

// TO:
<Sheet open={showSponsorDialog} onOpenChange={setShowSponsorDialog}>
  <SheetContent
    side="bottom"
    className="h-[90vh] overflow-y-auto rounded-t-2xl px-4 pt-2 pb-8 md:max-w-2xl md:mx-auto"
  >
    <SheetHeader className="mb-4">
      <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
      <SheetTitle>Sponsor Campaign</SheetTitle>
      <SheetDescription>
        Submit a sponsorship proposal for "{selectedCampaign?.title}"
      </SheetDescription>
    </SheetHeader>
    ...same form content, no changes needed...
  </SheetContent>
</Sheet>
```

- [ ] Open `BrandDiscoverCampaigns.tsx`
- [ ] Replace Dialog import with Sheet import
- [ ] Replace `<Dialog>` / `<DialogContent>` / `<DialogHeader>` / `<DialogTitle>` / `<DialogDescription>` with Sheet equivalents
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Test that the form opens as a bottom sheet on mobile and looks correct on desktop
- [ ] Commit: `fix: convert BrandDiscoverCampaigns sponsorship form from Dialog to bottom Sheet`

---

## Prompt 7 — Remove debug console.log statements from CreatorProjects

**Files to modify:**
- `src/pages/CreatorProjects.tsx`

**What's broken:**

Lines 53 and 78 have debug logging inside the React Query `queryFn`:
```tsx
console.log('Fetching projects for creator:', user?.id);  // line 53
console.log('Fetched projects:', data);  // line 78
```

These are debug artifacts that should never be in production code. They also expose user IDs and project data in the browser console.

**Fix:** Delete both lines entirely.

Line 120 in `handleMessageClick` has:
```tsx
console.error('Failed to open conversation:', error);
```
This one is in an error handler (fine to keep) — do not remove it.

- [ ] Open `CreatorProjects.tsx`
- [ ] Delete line 53: `console.log('Fetching projects for creator:', user?.id);`
- [ ] Delete line 78: `console.log('Fetched projects:', data);`
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: remove debug console.log statements from CreatorProjects`

---

## Prompt 8 — Fix CreatorApplications error state (add icon)

**Files to modify:**
- `src/pages/CreatorApplications.tsx`

**What's broken:**

Lines 44–55: The error state renders text-only without a visual icon, unlike the `CreatorProjects.tsx` error state which uses `AlertCircle`. This is an inconsistency between two similar pages.

**Current error JSX (lines 44–55):**
```tsx
if (error) {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
        <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
          <h3 className="font-bold text-gray-900 mb-2">Failed to load applications</h3>
          <p className="text-gray-500 text-sm">There was an error loading your applications.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
```

**Fix — add AlertCircle icon (matches CreatorProjects pattern):**
```tsx
// Add AlertCircle to the lucide-react import at line 4:
import { ArrowLeft, AlertCircle } from 'lucide-react';

// Update error JSX:
if (error) {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
        <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">Failed to load applications</h3>
          <p className="text-gray-500 text-sm">There was an error loading your applications. Please try again.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
```

- [ ] Open `CreatorApplications.tsx`
- [ ] Add `AlertCircle` to the lucide-react import
- [ ] Add `<AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />` to the error state card
- [ ] Update error description to "Please try again."
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: add AlertCircle icon to CreatorApplications error state`

---

## Prompt 9 — Fix CreatorCampaignMarketplace desktop empty state styling

**Files to modify:**
- `src/pages/CreatorCampaignMarketplace.tsx`

**What's broken:**

Lines 131–135: The desktop empty state (shown when all campaigns are applied/skipped) uses unstyled raw `<p>` tags:
```tsx
<div className="text-center py-16">
  <p className="text-lg font-semibold text-gray-700">No campaigns available</p>
  <p className="text-sm text-gray-500 mt-1">Check back soon for new opportunities!</p>
</div>
```

This is inconsistent with the rest of the app where empty states use teal-bordered cards with icons, and appears as naked floating text on desktop.

**Fix — use design system card pattern with icon:**
```tsx
<div className="border-2 border-dc-teal rounded-2xl p-10 text-center max-w-md mx-auto">
  <Target className="h-10 w-10 text-dc-teal mx-auto mb-3" />
  <h3 className="font-bold text-gray-900 mb-1">No campaigns available</h3>
  <p className="text-sm text-gray-500">You've reviewed all available campaigns. Check back soon for new opportunities!</p>
</div>
```

Add `Target` to the lucide-react import (already has `MapPin, DollarSign`).

- [ ] Open `CreatorCampaignMarketplace.tsx`
- [ ] Add `Target` to the lucide-react import
- [ ] Replace the desktop empty state `<div>` with the teal-bordered card version above
- [ ] Run `npm run build` — verify no errors
- [ ] Commit: `fix: replace plain text desktop empty state in CreatorCampaignMarketplace with teal card`

---

## Prompt 10 — Fix PublicCreatorProfile: replace select('*') with explicit fields

**Files to modify:**
- `src/pages/PublicCreatorProfile.tsx`

**What's broken:**

Line 80: The Supabase query uses `select('*')` which is explicitly prohibited by CLAUDE.md ("always include `.select()` field lists — avoid `select *` in production code").

**Current query (lines 78–84):**
```tsx
const { data, error } = await supabase
  .from('creator_profiles')
  .select('*')
  .eq('profile_slug', slug)
  .eq('profile_visibility', 'public')
  .single();
```

**Fix — replace with explicit field list based on the `CreatorProfile` interface (lines 12–42):**
```tsx
const { data, error } = await supabase
  .from('creator_profiles')
  .select(`
    id,
    user_id,
    creator_name,
    avatar_url,
    bio,
    skills,
    portfolio_urls,
    location,
    availability,
    base_rate_per_hour,
    years_of_experience,
    languages_spoken,
    timezone,
    response_time,
    min_project_budget,
    max_projects_per_month,
    preferred_project_duration,
    collaboration_preferences,
    instagram_url,
    tiktok_url,
    youtube_url,
    facebook_url,
    linkedin_url,
    x_url,
    other_social_url,
    website_url,
    created_at,
    average_rating,
    total_reviews
  `)
  .eq('profile_slug', slug)
  .eq('profile_visibility', 'public')
  .single();
```

- [ ] Open `PublicCreatorProfile.tsx`
- [ ] Replace `select('*')` with the explicit field list above (matching the `CreatorProfile` interface exactly)
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: replace select(*) with explicit field list in PublicCreatorProfile`

---

## Prompt 11 — Fix BrandCampaignDetails hardcoded "Restaurant Campaign" subtitle

**Files to modify:**
- `src/pages/BrandCampaignDetails.tsx`

**What's broken:**

The campaign details page has a hardcoded subtitle "Restaurant Campaign" which makes every campaign appear to be for a restaurant regardless of its actual category. This is a copy bug similar to the BrandDashboard "restaurant" issue fixed in Prompt 2.

**Steps:**
- [ ] Open `src/pages/BrandCampaignDetails.tsx`
- [ ] Search for "Restaurant Campaign" (hardcoded string)
- [ ] Replace with the actual campaign category/type from the campaign data, e.g.:
  ```tsx
  // If campaign has a category field:
  {campaign.category || 'Campaign'}

  // Or if it's always just a subtitle label:
  // Remove the hardcoded subtitle entirely
  ```
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: remove hardcoded Restaurant Campaign subtitle from BrandCampaignDetails`

---

## Prompt 12 — Audit and fix CreatorBrowse role mismatch

**Files to modify:**
- `src/pages/CreatorBrowse.tsx` (or whichever component passes `userRole`)
- Relevant child component(s) if `userRole` prop is passed down

**What's broken:**

The subagent audit flagged that somewhere in the creator browse flow, `userRole="business_client"` is used on a Creator-facing page. This would cause wrong navigation items to appear in the bottom nav.

**Steps:**
- [ ] Open `src/pages/CreatorBrowse.tsx` and read the full file
- [ ] Check the `DashboardLayout` or any component receiving a `userRole` prop
- [ ] If `userRole="business_client"` is found on a Creator page, change it to `userRole="content_creator"`
- [ ] Check `src/components/creator-browse/CreatorBrowseHeader.tsx` and `CreatorBrowseContent.tsx` for any incorrect role references
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: correct userRole prop on creator browse pages`

---

## Prompt 13 — Polish BrandCreators: add page-level error state

**Files to modify:**
- `src/pages/BrandCreators.tsx`

**What's broken:**

`BrandCreators.tsx` passes `error` to `CreatorBrowseContent` but has no page-level error handling. If the child component doesn't show an error (or if the error is in the hook itself), the page silently shows empty content.

**Steps:**
- [ ] Open `src/pages/BrandCreators.tsx`
- [ ] Add an error guard after the `useCreatorBrowse()` call:
  ```tsx
  if (error) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Unable to load creators</h3>
            <p className="text-gray-500 text-sm">Please refresh the page to try again.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  ```
- [ ] Add `AlertCircle` from lucide-react to imports
- [ ] Run `npm run build` — verify no TypeScript errors
- [ ] Commit: `fix: add page-level error state to BrandCreators`

---

## Execution order

Execute prompts in order — each is independent but later ones build on earlier fixes for a consistent polish pass:

1. **Prompt 1** — Loading states (highest user-facing impact)
2. **Prompt 2** — Brand copy ("restaurant" language)
3. **Prompt 3** — BrandSettings broken notifications
4. **Prompt 4** — BrandSponsorships off-brand button
5. **Prompt 5** — BrandAnalytics error state
6. **Prompt 6** — BrandDiscoverCampaigns Sheet pattern
7. **Prompt 7** — Remove console.logs (quick cleanup)
8. **Prompt 8** — CreatorApplications error icon (quick)
9. **Prompt 9** — CreatorCampaignMarketplace desktop empty state
10. **Prompt 10** — PublicCreatorProfile select fix
11. **Prompt 11** — BrandCampaignDetails copy fix
12. **Prompt 12** — CreatorBrowse role mismatch
13. **Prompt 13** — BrandCreators error state

Total estimated time: ~2–3 hours for all prompts.
