# Accessibility Audit Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 16 WCAG accessibility issues identified in docs/Ally_report.pdf across desktop and mobile.

**Architecture:** Six file-grouped batches, each build-verified independently. Option A contrast fix (dark text on teal/pink). Reusable Spinner component for loading states. shadcn Dialog replacement for custom modal.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui (Radix), framer-motion (reduced motion), react-router-dom (Link).

**Spec:** `docs/superpowers/specs/2026-05-06-accessibility-audit-remediation-design.md`

---

### Task 1: Create accessible Spinner component and update consumers

**Audit issues closed:** #4 (loading spinners not announced to screen readers)

**Files:**
- Create: `src/components/ui/spinner.tsx`
- Modify: `src/App.tsx:121`
- Modify: `src/components/ProtectedRoute.tsx:16`
- Modify: `src/components/VerifiedRoute.tsx:23`
- Modify: `src/components/files/FilePreviewContent.tsx:26`
- Modify: `src/pages/Index.tsx:140`
- Modify: `src/components/dragon-feed/DragonFeedCard.tsx:175`
- Modify: `src/components/dragon-feed/BusinessDashboardSideFeed.tsx:317`

Note: `src/components/campaigns/AdvancedCampaignFilters.tsx:126` is a tiny inline spinner inside an input — leave it as-is, it's not a page-level loading state.

- [ ] **Step 1: Create `src/components/ui/spinner.tsx`**

```tsx
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = "Loading..." }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite">
      <div
        className={cn(
          "animate-spin rounded-full border-b-2 border-dc-teal h-8 w-8",
          className
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/App.tsx:121`**

Replace the Suspense fallback spinner. Find:
```tsx
<Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dc-teal" /></div>}>
```
Replace with:
```tsx
<Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 3: Update `src/components/ProtectedRoute.tsx:16`**

Find:
```tsx
<div className="min-h-screen flex items-center justify-center">
  <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
</div>
```
Replace with:
```tsx
<div className="min-h-screen flex items-center justify-center">
  <Spinner className="h-32 w-32 border-pink-600" />
</div>
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 4: Update `src/components/VerifiedRoute.tsx:23`**

Identical pattern to ProtectedRoute. Find the `animate-spin` div, replace with:
```tsx
<Spinner className="h-32 w-32 border-pink-600" />
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 5: Update `src/components/files/FilePreviewContent.tsx:26`**

Find:
```tsx
<div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
</div>
```
Replace with:
```tsx
<div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
  <Spinner className="border-blue-600" label="Loading file preview..." />
</div>
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 6: Update `src/pages/Index.tsx:140`**

Find the `animate-spin` div inside the loading block. Replace ONLY the spinner div (preserve the "Loading DragonCandy..." text and debug block below it):
```tsx
<Spinner className="h-32 w-32 border-pink-600 mx-auto" label="Loading DragonCandy..." />
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 7: Update `src/components/dragon-feed/DragonFeedCard.tsx:175`**

Find:
```tsx
<div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
```
Replace with:
```tsx
<Spinner className="border-primary border-t-transparent" label="Loading image..." />
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 8: Update `src/components/dragon-feed/BusinessDashboardSideFeed.tsx:317`**

Identical pattern to DragonFeedCard. Find the `animate-spin` div, replace with:
```tsx
<Spinner className="border-primary border-t-transparent" label="Loading image..." />
```
Add import: `import { Spinner } from "@/components/ui/spinner";`

- [ ] **Step 9: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/spinner.tsx src/App.tsx src/components/ProtectedRoute.tsx src/components/VerifiedRoute.tsx src/components/files/FilePreviewContent.tsx src/pages/Index.tsx src/components/dragon-feed/DragonFeedCard.tsx src/components/dragon-feed/BusinessDashboardSideFeed.tsx
git commit -m "a11y: add accessible Spinner component, replace bare animate-spin divs (audit #4)"
```

---

### Task 2: Forms and auth accessibility

**Audit issues closed:** #3 (placeholder-only labels), #7 (errors not linked), #16 (SiteGate password)

**Files:**
- Modify: `src/components/auth/AuthForm.tsx:180-231`
- Modify: `src/pages/SiteGate.tsx:55-71`
- Modify: `src/components/onboarding/steps/IdentityStep.tsx:76-82`
- Modify: `src/components/onboarding/steps/BioStep.tsx:29-40`
- Modify: `src/components/campaigns/CampaignBriefStep.tsx:50-55`
- Modify: `src/components/business-profile/BusinessProfileForm.tsx:60`
- Modify: `src/pages/UpdatePassword.tsx:78-108`

- [ ] **Step 1: Fix AuthForm.tsx — add Labels and aria-required**

AuthForm already has `id` and `autoComplete` on all fields. Add a `<Label>` before each input and `aria-required="true"` to each.

Add import: `import { Label } from "@/components/ui/label";`

For Full Name input (line ~180), wrap the existing `<div>` content:
```tsx
<div className="space-y-1">
  <Label htmlFor="fullName" className="text-sm font-medium text-dc-text">Full Name</Label>
  <input
    id="fullName"
    type="text"
    name="fullName"
    value={fullName}
    autoComplete="name"
    required
    aria-required="true"
    onChange={e => setFullName(e.target.value)}
    placeholder="Full Name"
    disabled={loading}
    className="w-full h-12 rounded-lg bg-gray-100 ..."
  />
</div>
```

Apply the same pattern to Email (add `aria-required="true"`, `name="email"`, wrap with Label "Email") and Password (add `aria-required="true"`, wrap with Label "Password").

- [ ] **Step 2: Fix SiteGate.tsx — add visible label, id, name, autoComplete, link error**

Add import: `import { Label } from "@/components/ui/label";`

Replace the password input block (lines ~55-71):
```tsx
<div className="space-y-1">
  <Label htmlFor="site-password" className="sr-only">Site access password</Label>
  <input
    id="site-password"
    type="password"
    name="password"
    autoComplete="current-password"
    autoFocus
    value={password}
    onChange={(e) => {
      setPassword(e.target.value);
      if (error) setError('');
    }}
    placeholder="Password"
    aria-invalid={!!error}
    aria-describedby={error ? "site-password-error" : undefined}
    className="w-full h-12 rounded-full border-2 ..."
  />
  {error && (
    <p id="site-password-error" role="alert" className="text-sm text-dc-pink-accent font-semibold text-center">
      {error}
    </p>
  )}
</div>
```

Note: Use `sr-only` on the Label since the design uses placeholder-only visually (SiteGate is a simple password gate, not a full form). The `aria-label` can be removed since we now have a `<Label>`.

- [ ] **Step 3: Fix IdentityStep.tsx — add Label and id**

Add import: `import { Label } from "@/components/ui/label";`

Before the `<Input>` (line ~76), add:
```tsx
<Label htmlFor="creator-name" className="sr-only">{config.placeholder}</Label>
```
Add `id="creator-name"` to the `<Input>`.

- [ ] **Step 4: Fix BioStep.tsx — add Label and id**

Add import: `import { Label } from "@/components/ui/label";`

Before the `<Input>` (line ~29), add:
```tsx
<Label htmlFor="creator-bio" className="sr-only">Bio</Label>
```
Add `id="creator-bio"` to the `<Input>`.

- [ ] **Step 5: Fix CampaignBriefStep.tsx — add Label and id**

Add import: `import { Label } from "@/components/ui/label";`

Before the `<Textarea>` (line ~50), add:
```tsx
<Label htmlFor="campaign-goal" className="sr-only">Campaign goal</Label>
```
Add `id="campaign-goal"` to the `<Textarea>`.

- [ ] **Step 6: Fix BusinessProfileForm.tsx — add id to SelectTrigger**

Find (line ~60):
```tsx
<SelectTrigger>
```
Replace with:
```tsx
<SelectTrigger id="industry">
```

- [ ] **Step 7: Fix UpdatePassword.tsx — add aria-required, aria-invalid, aria-describedby**

Both password inputs already have proper labels, ids, and autoComplete. Add to each `<Input>`:
```tsx
aria-required="true"
aria-invalid={!!errorMessage}
aria-describedby={errorMessage ? "password-error" : undefined}
```

Add an inline error display below the confirm password input (in addition to the toast):
```tsx
{errorMessage && (
  <p id="password-error" role="alert" className="text-sm text-dc-pink-accent">
    {errorMessage}
  </p>
)}
```

This requires tracking the error in local state instead of only in toast. Add state: `const [errorMessage, setErrorMessage] = useState("");` and set it alongside the toast calls.

- [ ] **Step 8: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/auth/AuthForm.tsx src/pages/SiteGate.tsx src/components/onboarding/steps/IdentityStep.tsx src/components/onboarding/steps/BioStep.tsx src/components/campaigns/CampaignBriefStep.tsx src/components/business-profile/BusinessProfileForm.tsx src/pages/UpdatePassword.tsx
git commit -m "a11y: add form labels, aria-required, error linking, autocomplete (audit #3, #7, #16)"
```

---

### Task 3: Images, avatars, and media accessibility

**Audit issues closed:** #2 (missing alt), #5 (videos — interim), #14 (generic alt)

**Files (M1 — missing alt, 11 files):**
- Modify: `src/components/landing/PortfolioStrip.tsx`
- Modify: `src/components/business-profile/FileUploadSection.tsx`
- Modify: `src/components/campaign-details/CampaignFootageSection.tsx`
- Modify: `src/components/campaign-details/CampaignHero.tsx`
- Modify: `src/components/campaign-details/CampaignReferencesGallery.tsx`
- Modify: `src/components/creator-browse/CreatorCard.tsx`
- Modify: `src/components/creator-profile/PortfolioLightbox.tsx`
- Modify: `src/components/DashboardLayout.tsx`
- Modify: `src/components/creator-profile/AvatarUpload.tsx`
- Modify: `src/pages/BusinessActivity.tsx`
- Modify: `src/components/dragon-feed/FeedLightbox.tsx`

**Files (M2 — AvatarImage without alt, 5 files):**
- Modify: `src/components/files/FilePermissionsDialog.tsx`
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx`
- Modify: `src/components/creator-profile/ContactRestaurantModal.tsx`
- Modify: `src/components/files/FileCommentsPanel.tsx`
- Modify: `src/components/messages/MessageBubble.tsx`

**Files (M3 — generic alt, 6 files):**
- Modify: `src/pages/PromotionDetailPage.tsx`
- Modify: `src/components/promotions/VideoUploader.tsx`
- Modify: `src/components/onboarding/steps/IdentityStep.tsx`
- Modify: `src/components/campaigns/CampaignApplyForm.tsx`
- Modify: `src/pages/PublicCreatorProfile.tsx`
- Modify: `src/pages/PublicBusinessProfile.tsx`

**Files (M4 — decorative alt):**
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx`

**Files (M5 — video aria-label, 9 files):**
- Modify: `src/components/campaign-details/CampaignReferencesGallery.tsx`
- Modify: `src/components/promotions/SubmissionCard.tsx`
- Modify: `src/components/campaigns/MediaGallery.tsx`
- Modify: `src/components/files/FilePreviewContent.tsx`
- Modify: `src/components/promotions/ApprovedVideosTab.tsx`
- Modify: `src/components/creator-profile/CurrentPortfolioDisplay.tsx`
- Modify: `src/components/campaigns/OneTapApplySheet.tsx`
- Modify: `src/components/dragon-feed/DragonFeedCard.tsx`
- Modify: `src/pages/PublicCreatorProfile.tsx`

This is the largest batch (~25 files). Each fix is a one-line alt or aria-label addition. Execute file-by-file.

- [ ] **Step 1: M1 — Add alt to all `<img>` tags missing it**

For each file, find every `<img` tag without an `alt` attribute and add one using the strategy from the spec:

| File | Find `<img` without `alt` | Add |
|------|---------------------------|-----|
| PortfolioStrip.tsx | Portfolio thumbnail | `alt={item.caption ?? "Creator portfolio sample"}` |
| FileUploadSection.tsx (2 instances) | Upload previews | `alt={file.name ?? "Uploaded file preview"}` |
| CampaignFootageSection.tsx | Footage image | `alt="Campaign footage"` |
| CampaignHero.tsx | Hero image | `alt={campaign?.title ?? "Campaign cover"}` |
| CampaignReferencesGallery.tsx | Reference image | `alt="Campaign reference image"` |
| CreatorCard.tsx | Creator photo | `alt={creator.creator_name ?? "Creator"}` |
| PortfolioLightbox.tsx | Lightbox image | `alt={item?.caption ?? "Portfolio item"}` |
| DashboardLayout.tsx | Logo | `alt="DragonCandy"` |
| AvatarUpload.tsx | Avatar preview | `alt="Profile photo preview"` |
| BusinessActivity.tsx | Context image | `alt="Business activity"` (use available data if present) |
| FeedLightbox.tsx | Feed image | `alt={item?.caption ?? "Feed content"}` |

Open each file, search for `<img` without `alt=`, add the appropriate alt. Verify no `<img` tags are left without `alt`.

- [ ] **Step 2: M2 — Add alt to all `<AvatarImage>` tags**

| File | Add |
|------|-----|
| FilePermissionsDialog.tsx | `alt={user?.display_name ?? "User avatar"}` |
| CreatorProfileModal.tsx | `alt={creator?.creator_name ?? "Creator avatar"}` |
| ContactRestaurantModal.tsx | `alt={restaurant?.name ?? "Restaurant avatar"}` |
| FileCommentsPanel.tsx (2 instances) | `alt={commenter?.display_name ?? "User avatar"}` |
| MessageBubble.tsx | `alt={sender?.display_name ?? "User avatar"}` |

- [ ] **Step 3: M3 — Replace generic alt text**

| File | Find | Replace with |
|------|------|-------------|
| PromotionDetailPage.tsx | `alt="Submission"` | `alt="Content submission"` (or use creator name if available in scope) |
| VideoUploader.tsx | `alt="Preview"` | `alt="Video upload preview"` |
| IdentityStep.tsx | `alt="Preview"` | `alt="Profile photo preview"` |
| CampaignApplyForm.tsx | `` alt={`Portfolio ${i + 1}`} `` | `` alt={`Portfolio sample ${i + 1}`} `` |
| PublicCreatorProfile.tsx | `alt="Portfolio item N"` | Use `alt={item.caption ?? "Portfolio work"}` |
| PublicBusinessProfile.tsx | `alt="Sample content N"` | Use `alt={item.caption ?? "Sample content"}` |

- [ ] **Step 4: M4 — Fix decorative image alt**

In `CampaignSwipeCard.tsx`, find the blurred background `<img` with `alt="Campaign logo"` and change to `alt=""`.

- [ ] **Step 5: M5 — Add aria-label to all `<video>` elements**

For each file, find `<video` tags and add `aria-label` with descriptive context. Use available variable names from each component's scope:

| File | aria-label value |
|------|-----------------|
| CampaignReferencesGallery.tsx | `aria-label="Campaign reference video"` |
| SubmissionCard.tsx | `aria-label="Content submission video"` |
| MediaGallery.tsx | `aria-label="Campaign media"` |
| FilePreviewContent.tsx | `aria-label="File preview"` |
| ApprovedVideosTab.tsx | `aria-label="Approved video submission"` |
| CurrentPortfolioDisplay.tsx | `aria-label="Portfolio video"` |
| OneTapApplySheet.tsx | `aria-label="Portfolio video sample"` |
| DragonFeedCard.tsx | `aria-label="Feed video"` |
| PublicCreatorProfile.tsx | `aria-label="Portfolio video"` |

- [ ] **Step 6: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "a11y: add alt text to all images/avatars, aria-label to videos (audit #2, #5, #14)"
```

Note: Using `git add -A` here because of the large number of files. Review `git diff --cached` before committing to ensure only alt/aria-label changes are included.

---

### Task 4: Interactive elements and color contrast

**Audit issues closed:** #1 (contrast), #9 (div onClick), #13 (tabIndex), #15 (buttons as links)

**Files:**
- Modify: `src/components/promotions/PromotionCard.tsx:104,193-198`
- Modify: `src/components/ErrorBoundary.tsx:79-84`
- Modify: `src/components/ui/sidebar.tsx:297`
- Modify: `src/components/landing/HeroSection.tsx:20`
- Modify: `src/components/landing/BottomCTA.tsx:18`
- Modify: `src/components/creator-browse/CreatorCard.tsx:201`
- Modify: `src/components/creator-browse/CreatorBrowseContent.tsx`
- Modify: `src/pages/PricingPage.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/features/promotions/components/SyncStatusBadge.tsx:79`

**Corrections from code review:**
- `EditableField.tsx` is already a `<button>` — no fix needed
- `MediaGallery.tsx` is already a `<button>` — no fix needed
- `DashboardLayout.tsx:198` is a callback prop, not a direct button — skip (the OrgUnitSwitcher handles navigation internally)

- [ ] **Step 1: Fix PromotionCard.tsx — Card onClick → Link wrapper**

Replace `<Card onClick={() => navigate(...)}>` with a `<Link>` wrapper. Add import:
```tsx
import { Link } from "react-router-dom";
```

Wrap the Card in a Link:
```tsx
<Link to={`/dashboard/business/promotions/${promotion.id}`} className="block">
  <Card className="hover:shadow-md transition-shadow">
    {/* card contents — remove onClick from Card */}
  </Card>
</Link>
```

Also fix the "View details" button (lines ~193-198):
```tsx
<Link
  to={`/dashboard/business/promotions/${promotion.id}`}
  className="flex items-center gap-1 text-xs font-medium text-dc-teal hover:underline pt-1"
>
  View details
</Link>
```

- [ ] **Step 2: Fix ErrorBoundary.tsx — button → Link**

Find (line ~79-84):
```tsx
<button onClick={() => { window.location.href = '/dashboard'; }} className="block w-full text-sm text-gray-400 ...">
  Go to Dashboard
</button>
```
Replace with:
```tsx
<a href="/dashboard" className="block w-full text-sm text-dc-text-muted ...">
  Go to Dashboard
</a>
```

Note: ErrorBoundary is a class component, so it can't use react-router `<Link>` (no hooks). Use a plain `<a>` tag instead. Also fix `text-gray-400` → `text-dc-text-muted` for contrast.

Also fix the "Try Again" button contrast on the same page: `bg-dc-teal text-white` → `bg-dc-teal text-dc-text`.

- [ ] **Step 3: Fix sidebar.tsx — remove tabIndex={-1}**

Find (line ~297):
```tsx
tabIndex={-1}
```
Remove it from the button element. Leave all other attributes intact.

- [ ] **Step 4: Fix color contrast — teal buttons**

In each file, find `text-white` on teal backgrounds and replace with `text-dc-text`:

| File | Find | Replace |
|------|------|---------|
| HeroSection.tsx:20 | `bg-dc-teal text-white` | `bg-dc-teal text-dc-text` |
| BottomCTA.tsx:18 | `bg-dc-teal text-white` | `bg-dc-teal text-dc-text` |
| CreatorCard.tsx:201 | `bg-teal-400 text-white` | `bg-dc-teal text-dc-text` |
| CreatorBrowseContent.tsx | Find any `bg-dc-teal text-white` or `bg-teal-* text-white` | Replace text-white → text-dc-text |
| PricingPage.tsx | Find any teal bg + text-white CTAs | Replace text-white → text-dc-text |
| Index.tsx | Find any teal bg + text-white CTAs | Replace text-white → text-dc-text |

For pink backgrounds: `bg-dc-pink text-white` → `bg-dc-pink text-dc-text`. Keep `text-white` on `bg-dc-pink-accent` ONLY for large text (18px+ or 14px bold).

- [ ] **Step 5: Fix SyncStatusBadge.tsx contrast**

Find (line ~79):
```tsx
text: 'text-gray-400'
```
Replace with:
```tsx
text: 'text-dc-text-muted'
```
(`text-dc-text-muted` maps to #555555 which passes AA on white at 7.46:1)

- [ ] **Step 6: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/promotions/PromotionCard.tsx src/components/ErrorBoundary.tsx src/components/ui/sidebar.tsx src/components/landing/HeroSection.tsx src/components/landing/BottomCTA.tsx src/components/creator-browse/CreatorCard.tsx src/components/creator-browse/CreatorBrowseContent.tsx src/pages/PricingPage.tsx src/pages/Index.tsx src/features/promotions/components/SyncStatusBadge.tsx
git commit -m "a11y: fix color contrast, div onClick, tabIndex, button-as-link (audit #1, #9, #13, #15)"
```

---

### Task 5: Landmarks, navigation, and headings

**Audit issues closed:** #6 (multiple `<main>`), #8 (`<nav>` without aria-label), #10 (heading hierarchy)

**Files:**
- Modify: `src/pages/LandingPage.tsx:37`
- Modify: `src/components/DashboardLayout.tsx:271`
- Modify: `src/components/campaigns/AnonymousCampaignLayout.tsx:66`
- Modify: `src/pages/ForgotPassword.tsx:69`
- Modify: `src/pages/UpdatePassword.tsx:50`
- Modify: `src/components/landing/Header.tsx:47`
- Modify: `src/components/MobileTopNav.tsx:56`
- Modify: `src/components/MobileBottomNav.tsx:24`
- Modify: `src/pages/PublicCreatorProfile.tsx:248`
- Modify: Landing page child components (heading sweep)

- [ ] **Step 1: L1 — Remove duplicate `<main>` elements**

In each file, find the inner `<main` tag and replace with `<div` or `<section`:

| File | Find | Replace with |
|------|------|-------------|
| LandingPage.tsx:37 | `<main className="py-6 md:py-10 lg:py-12">` | `<section className="py-6 md:py-10 lg:py-12">` (and closing `</main>` → `</section>`) |
| DashboardLayout.tsx:271 | `<main className={...}>` | `<div className={...}>` (and closing tag) |
| AnonymousCampaignLayout.tsx:66 | `<main className="flex-1 px-4 ...">` | `<div className="flex-1 px-4 ...">` (and closing tag) |
| ForgotPassword.tsx:69 | Find `<main` | Replace with `<div` (and closing tag) |
| UpdatePassword.tsx:50 | Find `<main` | Replace with `<div` (and closing tag) |

The single `<main id="main-content">` in `App.tsx:286` remains as the only main landmark.

- [ ] **Step 2: L2 — Add aria-label to `<nav>` elements**

| File | Find | Add |
|------|------|-----|
| Header.tsx:47 | `<nav className="hidden md:flex items-center gap-8">` | `<nav aria-label="Primary" className="hidden md:flex items-center gap-8">` |
| MobileTopNav.tsx:56 | `<nav className="flex-1 overflow-y-auto">` | `<nav aria-label="Mobile" className="flex-1 overflow-y-auto">` |
| MobileBottomNav.tsx:24 | `<nav className={...}>` | Add `aria-label="Mobile bottom"` to the nav |

- [ ] **Step 3: L3 — Fix heading hierarchy (PublicCreatorProfile error state)**

In `PublicCreatorProfile.tsx`, find the error state `<h3>` "Creator Profile Not Found" (~line 248) and change to `<h1>`.

- [ ] **Step 4: L3 — Heading sweep for landing page components**

Search for `<h1` across all landing page child components. Demote any `<h1>` that is NOT the page-level hero title to `<h2>`. The LandingPage itself should have exactly one `<h1>` (in HeroSection).

Run: grep for `<h1` in `src/components/landing/` and `src/pages/LandingPage.tsx`

For each component that has `<h1>`:
- If it's the HeroSection hero title → keep as `<h1>`
- Everything else → change to `<h2>`

Also check `src/pages/` for other pages with multiple `<h1>` tags and fix.

- [ ] **Step 5: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LandingPage.tsx src/components/DashboardLayout.tsx src/components/campaigns/AnonymousCampaignLayout.tsx src/pages/ForgotPassword.tsx src/pages/UpdatePassword.tsx src/components/landing/Header.tsx src/components/MobileTopNav.tsx src/components/MobileBottomNav.tsx src/pages/PublicCreatorProfile.tsx
git commit -m "a11y: fix duplicate main, nav aria-labels, heading hierarchy (audit #6, #8, #10)"
```

Add any additional landing component files that had heading changes to the git add.

---

### Task 6: Carousel pause, focus reset, and modal refactor

**Audit issues closed:** #11 (carousel auto-advance), #12 (focus reset on route change)

**Files:**
- Modify: `src/components/campaign-creator/SamplePromptCarousel.tsx:40-45`
- Modify: `src/App.tsx:118-122` (AnimatedRoutes)
- Modify: `src/components/creator-profile/CreatorPortfolioModal.tsx`

- [ ] **Step 1: Fix SamplePromptCarousel.tsx — add pause control + reduced motion**

Add imports:
```tsx
import { useState } from "react";
import { useReducedMotion } from "@/lib/motion";
```

Replace the auto-advance useEffect (lines ~40-45):
```tsx
const reducedMotion = useReducedMotion();
const [paused, setPaused] = useState(false);

useEffect(() => {
  if (reducedMotion || paused) return;
  const id = setInterval(() => {
    setActiveIndex((i) => (i + 1) % TEMPLATES.length);
  }, 5000);
  return () => clearInterval(id);
}, [reducedMotion, paused]);
```

Add hover/focus pause handlers to the carousel container:
```tsx
onMouseEnter={() => setPaused(true)}
onMouseLeave={() => setPaused(false)}
onFocusCapture={() => setPaused(true)}
onBlurCapture={() => setPaused(false)}
```

Add a visible pause/resume button inside the carousel:
```tsx
<button
  type="button"
  aria-label={paused ? "Resume carousel" : "Pause carousel"}
  onClick={() => setPaused(p => !p)}
  className="absolute top-2 right-2 p-1 rounded-full bg-dc-dark/50 text-white text-xs"
>
  {paused ? "Play" : "Pause"}
</button>
```

- [ ] **Step 2: Fix App.tsx — add focus reset on route change**

Inside the `AnimatedRoutes` function (line ~118), add a `useEffect` after the existing `useLocation()` call:

```tsx
import { useEffect } from "react";
// ... existing imports

function AnimatedRoutes() {
  const location = useLocation();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: false });
    }
  }, [location.pathname]);

  return (
    // ... existing Suspense + PageTransition
  );
}
```

- [ ] **Step 3: Refactor CreatorPortfolioModal.tsx → shadcn Dialog**

The current modal is a custom `<div className="fixed inset-0 z-50 ...">` with manual keyboard handlers. Replace with shadcn Dialog.

Add imports:
```tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
```

Replace the outer structure. The current component has props: `isOpen, onClose, creatorName, images, currentIndex, onIndexChange`.

Refactor to:
```tsx
export function CreatorPortfolioModal({
  isOpen,
  onClose,
  creatorName,
  images,
  currentIndex,
  onIndexChange,
}: CreatorPortfolioModalProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      onIndexChange(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
    } else if (e.key === "ArrowRight") {
      onIndexChange(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-4xl w-full h-[80vh] p-0 bg-dc-dark border-none"
        aria-label={`${creatorName}'s portfolio`}
        onKeyDown={handleKeyDown}
      >
        {/* Preserve existing image display, navigation arrows, thumbnail strip */}
        {/* Move all inner content here */}
      </DialogContent>
    </Dialog>
  );
}
```

Remove the old `fixed inset-0` div, the manual Escape handler (Dialog handles it), and the `tabIndex={-1}`. Keep the arrow-key navigation logic (it adds portfolio-specific keyboard nav on top of Dialog's built-in focus trap).

- [ ] **Step 4: Build verify**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaign-creator/SamplePromptCarousel.tsx src/App.tsx src/components/creator-profile/CreatorPortfolioModal.tsx
git commit -m "a11y: carousel pause control, focus reset on route change, Dialog modal (audit #11, #12)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 2: Start dev server and smoke test**

Run: `npm run dev`

Test in browser:
1. Landing page — verify teal/pink buttons have dark text, headings are h1/h2 only, nav has aria-labels
2. Auth flow — verify form labels visible (or sr-only), autocomplete works, error messages announced
3. Dashboard — verify single `<main>`, spinner has sr-only text, sidebar rail button is tabbable
4. Creator profile — verify portfolio modal opens with focus trapped inside, arrow keys work
5. Campaign browse — verify creator card images have alt text, teal CTAs have dark text
6. Messaging — verify avatar images have alt text

- [ ] **Step 3: Keyboard-only walkthrough**

Navigate the entire app using only Tab/Shift+Tab/Enter/Space/Arrow keys. Verify:
- All interactive elements are reachable
- Focus is visible on all elements
- Focus resets to main content on route change
- Carousel pauses on focus
- Modal traps focus

- [ ] **Step 4: Commit any final fixes if needed**
