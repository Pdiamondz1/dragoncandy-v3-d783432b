# Accessibility Audit Remediation — Design Spec

**Date:** 2026-05-06
**Source:** `docs/Ally_report.pdf` (18-page WCAG 2.1 audit)
**Scope:** All 16 issues across desktop and mobile
**Strategy:** File-grouped batches (6 batches, build-verify after each)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Color contrast approach | Option A: dark text on teal/pink backgrounds | Preserves brand colors, uses existing `text-dc-text` (#111111). No new tokens needed. 11.7:1 ratio on teal. |
| Video captions | Interim `aria-label` only | **Known non-conformance with WCAG 1.2.2.** `aria-label` improves screen-reader context but does not satisfy the captions requirement. Full caption generation (Whisper/AssemblyAI + `.vtt` storage) deferred to a separate workstream. |
| CreatorPortfolioModal focus trap | Replace with shadcn `<Dialog>` | Rest of app uses Radix dialogs. Focus trap, Escape, SR announcements come free. |
| Gray class usage | Never use `text-gray-*` on brand elements | Use `text-dc-text` (#111111) for dark text. DragonCandy palette is teal + pink only. |

## Skipped Items

- `src/components/DesktopGate.tsx` — file does not exist in codebase

Note: `AnonymousCampaignLayout.tsx` exists at `src/components/campaigns/AnonymousCampaignLayout.tsx` (not `src/components/`). It is included in Batch 5 (L1).

## Audit Issue Traceability

| Audit # | Issue | Severity | Batch | Fix ID |
|---------|-------|----------|-------|--------|
| 1 | Brand color contrast fails on CTAs | Critical | 4 | Contrast |
| 2 | `<img>` / `<AvatarImage>` without alt | Critical | 3 | M1, M2 |
| 3 | Form inputs labeled only by placeholder | Critical | 2 | F1 |
| 4 | Loading spinners not announced | High | 1 | Spinner |
| 5 | Videos lack `<track kind="captions">` | High | 3 | M5 (interim) |
| 6 | Multiple `<main>` elements per page | High | 5 | L1 |
| 7 | Form errors not linked to inputs | High | 2 | F2 |
| 8 | `<nav>` without aria-label | Medium | 5 | L2 |
| 9 | `<div onClick>` for cards/editable fields | Medium | 4 | I1 |
| 10 | Heading hierarchy (h3 before h2, multiple h1s) | Medium | 5 | L3 |
| 11 | Auto-advancing carousel with no pause | Medium | 6 | L6 |
| 12 | No focus reset on route change | Medium | 6 | L4 |
| 13 | `tabIndex={-1}` on interactive button | Medium | 4 | I3 |
| 14 | Generic alt text | Low | 3 | M3 |
| 15 | Buttons using `window.location.href` | Low | 4 | I2 |
| 16 | Password input missing id/name/autocomplete | Low | 2 | F4 |

---

## Batch 1: Foundation — Spinner Component

**Issues closed:** #4 (loading spinners not announced to screen readers)

### New file: `src/components/ui/spinner.tsx`

Accessible spinner wrapper. Encapsulates:
- `role="status"` container
- `aria-live="polite"`
- `<span className="sr-only">Loading...</span>`
- Accepts optional `className` for size variants
- Accepts optional `label` prop for context-specific messages

### Consumer updates (8 files — loading-state spinners only)

The codebase has ~72 files containing `animate-spin`, but most are button loading indicators or icon animations that already live inside interactive elements with accessible names. This batch targets the 8 **page/route-level loading spinners** identified in the audit — the ones where a screen reader hears nothing while content loads. Remaining `animate-spin` instances (button states, inline indicators) can be swept in a follow-up pass.

Replace bare `<div className="animate-spin ...">` with `<Spinner />`:

| File | Line | Notes |
|------|------|-------|
| `src/App.tsx` | ~122 | Suspense fallback |
| `src/components/ProtectedRoute.tsx` | ~16 | |
| `src/components/VerifiedRoute.tsx` | ~23 | |
| `src/components/files/FilePreviewContent.tsx` | ~26 | |
| `src/pages/Index.tsx` | ~134 | |
| `src/components/dragon-feed/DragonFeedCard.tsx` | ~175 | |
| `src/components/dragon-feed/BusinessDashboardSideFeed.tsx` | ~317 | |
| `src/components/campaigns/AdvancedCampaignFilters.tsx` | ~126 | |

---

## Batch 2: Forms & Auth Accessibility

**Issues closed:** #3 (placeholder-only labels), #7 (errors not linked), #16 (SiteGate password)

### F1 — Visible labels for all inputs

Add `<Label htmlFor="x">` paired with `id="x"` on each input:

| File | Fields |
|------|--------|
| `src/components/auth/AuthForm.tsx` | Full Name, Email, Password |
| `src/components/onboarding/steps/IdentityStep.tsx` | Creator name |
| `src/components/onboarding/steps/BioStep.tsx` | Bio textarea |
| `src/components/campaigns/CampaignBriefStep.tsx` | Campaign goal textarea |
| `src/pages/SiteGate.tsx` | Password |

Pattern (already used in `ForgotPassword.tsx`):
```tsx
<div className="space-y-1">
  <Label htmlFor="email">Email address</Label>
  <Input
    id="email"
    type="email"
    name="email"
    autoComplete="email"
    required
    aria-required="true"
    aria-invalid={!!error}
    aria-describedby={error ? "email-error" : undefined}
    placeholder="you@example.com"
    value={value}
    onChange={...}
  />
  {error && (
    <p id="email-error" role="alert" className="text-sm text-pink-600">
      {error}
    </p>
  )}
</div>
```

### F2 — Error messages linked to inputs

| File | Fix |
|------|-----|
| `src/pages/SiteGate.tsx` | Add `aria-describedby` linking error `<p>` to input, add `role="alert"` |
| `src/pages/UpdatePassword.tsx` | Add `aria-invalid` on inputs when validation fails (currently only uses toast) |

### F3 — `aria-required="true"` on required fields

| File | Fields |
|------|--------|
| `src/components/auth/AuthForm.tsx` | All three signup fields |
| `src/pages/UpdatePassword.tsx` | Password, confirm password |

### F4 — `autoComplete` attributes

| File | Fix |
|------|-----|
| `src/pages/SiteGate.tsx` | `autoComplete="current-password"`, `name="password"` |
| `src/components/auth/AuthForm.tsx` | Email: `autoComplete="email"`, signup pw: `autoComplete="new-password"`, login pw: `autoComplete="current-password"` |

### F5 — Select trigger missing id

| File | Fix |
|------|-----|
| `src/components/business-profile/BusinessProfileForm.tsx` | Pass `id="industry"` to `<SelectTrigger>` |

---

## Batch 3: Images, Avatars & Media

**Issues closed:** #2 (missing alt), #5 (videos lack captions — interim), #14 (generic alt)

### M1 — `<img>` with no `alt` attribute (11 files)

| File | Alt strategy |
|------|-------------|
| `src/components/landing/PortfolioStrip.tsx` | Portfolio thumbnail: `alt={item.caption ?? "Creator portfolio sample"}` |
| `src/components/business-profile/FileUploadSection.tsx` (x2) | Upload preview: `alt={file.name ?? "Uploaded file preview"}` |
| `src/components/campaign-details/CampaignFootageSection.tsx` | Footage: `alt={item.caption ?? "Campaign footage"}` |
| `src/components/campaign-details/CampaignHero.tsx` | Campaign hero: `alt={campaign.title ?? "Campaign cover"}` |
| `src/components/campaign-details/CampaignReferencesGallery.tsx` | Reference: `alt={item.caption ?? "Campaign reference image"}` |
| `src/components/creator-browse/CreatorCard.tsx` | Creator photo: `alt={creator.creator_name}` |
| `src/components/creator-profile/PortfolioLightbox.tsx` | Portfolio item: `alt={item.caption ?? "Portfolio item"}` |
| `src/components/DashboardLayout.tsx` | Logo: `alt="DragonCandy"` |
| `src/components/creator-profile/AvatarUpload.tsx` | Avatar preview: `alt="Profile photo preview"` |
| `src/pages/BusinessActivity.tsx` | Context-dependent: use available data |
| `src/components/dragon-feed/FeedLightbox.tsx` | Feed item: `alt={item.caption ?? "Feed content"}` |

### M2 — `<AvatarImage>` without `alt` (5 files)

Pass `alt={user.display_name ?? user.full_name ?? "User avatar"}`:

| File |
|------|
| `src/components/files/FilePermissionsDialog.tsx` |
| `src/components/creator-browse/CreatorProfileModal.tsx` |
| `src/components/creator-profile/ContactRestaurantModal.tsx` |
| `src/components/files/FileCommentsPanel.tsx` (x2) |
| `src/components/messages/MessageBubble.tsx` |

### M3 — Generic alt text (6 files)

| File | Current | Fix |
|------|---------|-----|
| `src/pages/PromotionDetailPage.tsx` | `"Submission"` | `alt={submission.creator_name ? \`${submission.creator_name} submission\` : "Content submission"}` |
| `src/components/promotions/VideoUploader.tsx` | `"Preview"` | `alt="Video upload preview"` |
| `src/components/onboarding/steps/IdentityStep.tsx` | `"Preview"` | `alt="Profile photo preview"` |
| `src/components/campaigns/CampaignApplyForm.tsx` | `"Portfolio N"` | `alt={\`Portfolio sample ${i + 1} of ${total}\`}` |
| `src/pages/PublicCreatorProfile.tsx` | `"Portfolio item N"` | `alt={item.caption ?? \`${creator_name} portfolio work\`}` |
| `src/pages/PublicBusinessProfile.tsx` | `"Sample content N"` | `alt={item.caption ?? \`${business_name} sample content\`}` |

### M4 — Decorative image with descriptive alt

| File | Fix |
|------|-----|
| `src/components/campaigns/CampaignSwipeCard.tsx` | Change blurred background `alt="Campaign logo"` → `alt=""` |

### M5 — Videos: interim `aria-label` (9 files)

Add `aria-label` with descriptive context to all `<video>` elements:

| File |
|------|
| `src/components/campaign-details/CampaignReferencesGallery.tsx` |
| `src/components/promotions/SubmissionCard.tsx` |
| `src/components/campaigns/MediaGallery.tsx` |
| `src/components/files/FilePreviewContent.tsx` |
| `src/components/promotions/ApprovedVideosTab.tsx` |
| `src/components/creator-profile/CurrentPortfolioDisplay.tsx` |
| `src/components/campaigns/OneTapApplySheet.tsx` |
| `src/components/dragon-feed/DragonFeedCard.tsx` |
| `src/pages/PublicCreatorProfile.tsx` |

Pattern: `<video controls aria-label={\`Portfolio video by ${creator_name}\`}>...`

Full caption generation (`<track kind="captions">` via Whisper/AssemblyAI) deferred to a separate workstream.

---

## Batch 4: Interactive Elements & Color Contrast

**Issues closed:** #1 (contrast), #9 (div onClick), #13 (tabIndex), #15 (buttons as links)

### I1 — `<div onClick>` without keyboard handler

| File | Fix |
|------|-----|
| `src/components/promotions/PromotionCard.tsx` (line ~104) | The `<Card onClick={navigate(...)}>` is the keyboard-inaccessible element (line ~108 is just an inner `stopPropagation` div). Wrap the entire card in `<Link to=...>` so navigation, right-click, and keyboard all work natively. |
| `src/components/campaign-creator/EditableField.tsx` (line ~26) | Convert trigger div to `<button type="button">` |
| `src/components/campaigns/MediaGallery.tsx` (line ~49) | Convert clickable div to `<button type="button">` |

### I2 — Buttons that should be `<Link>`

| File | Fix |
|------|-----|
| `src/components/DashboardLayout.tsx` (line ~198) | `<button onClick={navigate}>` → `<Link to="...">` |
| `src/components/ErrorBoundary.tsx` (line ~80) | Same |
| `src/components/promotions/PromotionCard.tsx` (line ~199) | "View details" button → `<Link to={...} className={buttonVariants()}>` |

### I3 — `tabIndex={-1}` on interactive button

| File | Fix |
|------|-----|
| `src/components/ui/sidebar.tsx` (line ~297) | Remove `tabIndex={-1}` from sidebar rail toggle |

### Color contrast — Option A: dark text on brand backgrounds

Strategy: Swap `text-white` to `text-dc-text` on teal and light-pink backgrounds. Keep white text only on deep pink (`#EC4899`) at large sizes.

| File | Change |
|------|--------|
| `src/components/landing/HeroSection.tsx` | Pink CTAs: `text-white` → `text-dc-text` on pink bg |
| `src/components/landing/BottomCTA.tsx` | Same |
| `src/components/creator-browse/CreatorCard.tsx` | Teal CTAs: `text-white` → `text-dc-text` on `bg-dc-teal` |
| `src/components/creator-browse/CreatorBrowseContent.tsx` | Same |
| `src/pages/PricingPage.tsx` | Teal/pink CTAs |
| `src/pages/Index.tsx` | Review and fix any failing combinations |
| `src/features/promotions/components/SyncStatusBadge.tsx` | Bump low-contrast text classes to darker equivalents |

---

## Batch 5: Landmarks, Navigation & Headings

**Issues closed:** #6 (multiple `<main>`), #8 (`<nav>` without aria-label), #10 (heading hierarchy)

### L1 — Remove duplicate `<main>` elements

Replace inner `<main>` with `<div>` or `<section>`:

| File | Line |
|------|------|
| `src/pages/LandingPage.tsx` | ~31 |
| `src/components/DashboardLayout.tsx` | ~271 |
| `src/components/campaigns/AnonymousCampaignLayout.tsx` | ~66 |
| `src/pages/ForgotPassword.tsx` | ~69 |
| `src/pages/UpdatePassword.tsx` | ~77 |

Keep only `<main id="main-content">` in `App.tsx`.

### L2 — `<nav>` aria-labels

| File | Label |
|------|-------|
| `src/components/landing/Header.tsx` | `aria-label="Primary"` |
| `src/components/MobileTopNav.tsx` | `aria-label="Mobile"` |
| `src/components/MobileBottomNav.tsx` | `aria-label="Mobile bottom"` |

### L3 — Heading hierarchy

- `src/pages/PublicCreatorProfile.tsx` — Error-state `<h3>` → `<h1>`
- Landing page components — Sweep all child components, demote `<h1>` to `<h2>` where they are not the page-level title. Target: exactly one `<h1>` per rendered page.
- Fix any h1→h3 level skips discovered during the sweep.

---

## Batch 6: Carousel, Focus & Modal

**Issues closed:** #11 (carousel auto-advance), #12 (focus reset on route change)

### L6 — SamplePromptCarousel pause control

`src/components/campaign-creator/SamplePromptCarousel.tsx`:

- Add `const [paused, setPaused] = useState(false)` state
- Respect `useReducedMotion()` from `src/lib/motion.tsx` (re-exports framer-motion's hook — import as `import { useReducedMotion } from "@/lib/motion"`)
- Pause on hover (`onMouseEnter`/`onMouseLeave`)
- Pause when interactive elements inside have focus (`onFocusCapture`/`onBlurCapture`)
- Visible pause/resume button: `<button aria-label={paused ? "Resume carousel" : "Pause carousel"}>`
- Auto-advance only when `!reducedMotion && !paused`

### L4 — Focus reset on route change

`src/App.tsx` — Add inside `AnimatedRoutes`:

```tsx
useEffect(() => {
  const main = document.getElementById("main-content");
  if (main) {
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: false });
  }
}, [location.pathname]);
```

### L7 — CreatorPortfolioModal → shadcn Dialog

`src/components/creator-profile/CreatorPortfolioModal.tsx`:

- Replace custom modal with shadcn `<Dialog>` / `<DialogContent>`
- Preserve existing keyboard nav (arrow keys for portfolio items)
- Preserve Escape handling (comes free from Radix)
- Focus trap automatic via Radix

---

## Verification Plan

After all 6 batches are complete:

1. `npm run build` — must pass with zero errors
2. Manual browser testing of golden paths:
   - Landing page → auth flow → dashboard
   - Creator profile → portfolio modal → messaging
   - Campaign browse → apply → campaign details
3. Post-fix accessibility re-audit using:
   - axe DevTools (Chrome extension) on all public pages
   - Lighthouse Accessibility audit (target 95+)
   - Keyboard-only walkthrough (Tab/Shift+Tab/Enter/Space/Arrow)
   - Contrast spot-checks on all brand-color combinations

---

## Files Referenced (complete list)

**Batch 1 (9 files):** spinner.tsx (new), App.tsx, ProtectedRoute.tsx, VerifiedRoute.tsx, FilePreviewContent.tsx, Index.tsx, DragonFeedCard.tsx, BusinessDashboardSideFeed.tsx, AdvancedCampaignFilters.tsx

**Batch 2 (7 files):** AuthForm.tsx, SiteGate.tsx, IdentityStep.tsx, BioStep.tsx, CampaignBriefStep.tsx, BusinessProfileForm.tsx, UpdatePassword.tsx

**Batch 3 (~25 files):** PortfolioStrip.tsx, FileUploadSection.tsx, CampaignFootageSection.tsx, CampaignHero.tsx, CampaignReferencesGallery.tsx, CreatorCard.tsx, PortfolioLightbox.tsx, DashboardLayout.tsx, AvatarUpload.tsx, BusinessActivity.tsx, FeedLightbox.tsx, FilePermissionsDialog.tsx, CreatorProfileModal.tsx, ContactRestaurantModal.tsx, FileCommentsPanel.tsx, MessageBubble.tsx, PromotionDetailPage.tsx, VideoUploader.tsx, IdentityStep.tsx, CampaignApplyForm.tsx, PublicCreatorProfile.tsx, PublicBusinessProfile.tsx, CampaignSwipeCard.tsx, SubmissionCard.tsx, MediaGallery.tsx, ApprovedVideosTab.tsx, CurrentPortfolioDisplay.tsx, OneTapApplySheet.tsx

**Batch 4 (~10 files):** PromotionCard.tsx, EditableField.tsx, MediaGallery.tsx, DashboardLayout.tsx, ErrorBoundary.tsx, sidebar.tsx, HeroSection.tsx, BottomCTA.tsx, CreatorBrowseContent.tsx, PricingPage.tsx, Index.tsx, SyncStatusBadge.tsx

**Batch 5 (~11 files):** LandingPage.tsx, DashboardLayout.tsx, AnonymousCampaignLayout.tsx, ForgotPassword.tsx, UpdatePassword.tsx, Header.tsx, MobileTopNav.tsx, MobileBottomNav.tsx, PublicCreatorProfile.tsx, plus landing subcomponents for heading sweep

**Batch 6 (3 files):** SamplePromptCarousel.tsx, App.tsx, CreatorPortfolioModal.tsx
