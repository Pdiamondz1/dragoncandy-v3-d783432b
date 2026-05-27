# Hide Brand Role via Feature Flag

## Overview

The Brand/Sponsor role is fully wired into DragonCandy (8 pages, 14 routes, complete navigation stacks, onboarding flows, 25+ files with brand-specific logic) but has never been tested or used by real users. Rather than deleting the brand infrastructure, we hide it from all public-facing surfaces and from restaurant/creator workflows behind a single feature flag constant. Existing brand accounts (e.g., the test account) retain full access for development and QA.

## Decision

**Approach: Single constant feature flag** in `src/lib/featureConfig.ts`.

Alternatives considered and rejected:
- **Database-backed flag** (`feature_flags` table): Adds async loading, flicker, and cache management. Overkill for a binary launch gate flipped once.
- **Environment variable** (`VITE_BRAND_ROLE_ENABLED`): No advantage over a constant given single-environment deployment (Lovable.dev → production). Harder to discover in codebase.

## Scope

### What gets hidden (flag = `false`)

#### 1. Landing Page (`src/pages/LandingPage.tsx` and children)

| Component | Element hidden |
|-----------|---------------|
| `src/components/landing/Header.tsx` | "For Brands" nav link (filter from `navLinks` array — hides from both desktop and mobile nav in one change) |
| `src/components/landing/HeroSection.tsx` | "I'm a Brand/Sponsor — Launch Campaigns" CTA button |
| `src/pages/LandingPage.tsx` | `<BrandSection />` render (gate at call site to eliminate import/render overhead) |
| `src/components/landing/BottomCTA.tsx` | "I'm a Brand/Sponsor — Launch Campaigns" button AND paragraph copy mentioning "brand" (conditionally render brand-inclusive vs brand-exclusive copy) |

#### 2. Sign-Up Flow

| Component | Element hidden |
|-----------|---------------|
| `src/components/auth/RoleSelection.tsx` | "I'm a Brand/Sponsor" role card (pink Megaphone variant) |

When hidden, the role selection layout adjusts to show only two cards (Restaurant and Creator), centered.

#### 3. Sponsorship UI in Restaurant Views

| Component | Element hidden |
|-----------|---------------|
| `src/components/campaigns/CampaignFinalizeStep.tsx` | "Open for brand sponsorships" checkbox in campaign creation |
| `src/components/campaigns/CampaignSponsorshipToggle.tsx` | Brand Sponsorship Settings toggle card in campaign editing |
| `src/pages/CampaignDetailsPage.tsx` | `SponsorshipCard` rendering (conditional on `open_for_sponsorship`) |
| `src/components/campaigns/CreatorApplicationsCard.tsx` | Joint approval UI for sponsored campaigns |
| `src/components/campaigns/ApplicationsListFixed.tsx` | Sponsored campaign joint approval logic |

#### 4. Sponsorship UI in Creator Views

| Component | Element hidden |
|-----------|---------------|
| `src/pages/CampaignDetailsPage.tsx` | `SponsorshipCard` component on campaign detail pages |

### What stays untouched (flag has no effect)

- **`BrandRoute` guard** — Existing brand accounts still access `/dashboard/brand/*`
- **All 8 brand dashboard pages** — `BrandDashboard`, `BrandAnalytics`, `BrandCampaignDetails`, `BrandCreators`, `BrandDiscoverCampaigns`, `BrandMessages`, `BrandSponsorships`, `BrandStylePicker`
- **Brand route definitions in `App.tsx`** — All 18 `/dashboard/brand/*` routes remain registered
- **Brand navigation configs in `navConfig.ts`** — `brandSidebarNav`, `brandBottomNav`, `brandDrawerMenu` arrays unchanged
- **Brand onboarding and first-run** — `OnboardingWizard` brand steps, `FirstRunDashboard` brand missions, `BrandStylePicker`
- **Brand guided tour** — `BRAND_TOUR` in `role-tours.ts`
- **Database schema** — No table, column, or RLS changes
- **Brand-specific hooks** — All `useBrand*` hooks remain
- **`AuthContext` role handling** — Still routes brand users to brand dashboard on login
- **Type definitions** — `UserRole` union type keeps `'brand'`

## Implementation

### Feature Flag File

Create `src/lib/featureConfig.ts`:

```typescript
export const BRAND_ROLE_ENABLED = false;
```

### Gating Pattern

Each affected component imports the flag and wraps brand-specific JSX:

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';

// In render:
{BRAND_ROLE_ENABLED && (
  <BrandSpecificElement />
)}
```

For `Header.tsx`, filter the `navLinks` array based on the flag: `const links = BRAND_ROLE_ENABLED ? navLinks : navLinks.filter(l => l.target !== 'brands');` This hides from both desktop and mobile nav in one change.

For `LandingPage.tsx`, gate the `<BrandSection />` call at the render site rather than inside the component. This eliminates the import/render overhead entirely when the flag is off.

For `BottomCTA.tsx`, conditionally render both the brand CTA button and the paragraph copy. When hidden, the text reads "Whether you're a restaurant or a creator — DragonCandy has you covered." instead of mentioning brands.

For `RoleSelection.tsx`, the brand role card is conditionally rendered, and the remaining two cards reflow naturally via flex layout.

For `CampaignFinalizeStep.tsx`, the sponsorship checkbox section is wrapped in the same conditional.

For `CampaignSponsorshipToggle.tsx`, the component returns `null` when `BRAND_ROLE_ENABLED` is `false`. This hides it everywhere it's used (currently `CampaignEditPage.tsx`) without modifying the consuming page.

### Files Modified

1. `src/lib/featureConfig.ts` — **NEW** — Feature flag constant
2. `src/components/landing/Header.tsx` — Filter "For Brands" from `navLinks` array
3. `src/components/landing/HeroSection.tsx` — Hide brand CTA button
4. `src/pages/LandingPage.tsx` — Gate `<BrandSection />` render at call site
5. `src/components/landing/BottomCTA.tsx` — Hide brand CTA button + conditionally render paragraph copy
6. `src/components/auth/RoleSelection.tsx` — Hide brand role card
7. `src/components/campaigns/CampaignFinalizeStep.tsx` — Hide sponsorship checkbox
8. `src/components/campaigns/CampaignSponsorshipToggle.tsx` — Return `null` when flag is off (hides in `CampaignEditPage.tsx` implicitly)
9. `src/pages/CampaignDetailsPage.tsx` — Hide SponsorshipCard rendering
10. `src/components/campaigns/CreatorApplicationsCard.tsx` — Hide joint approval UI
11. `src/components/campaigns/ApplicationsListFixed.tsx` — Hide sponsored campaign logic

### Estimated Change Size

~11 files touched, ~1-5 lines changed per file (import + conditional wrap/filter). One new file (featureConfig.ts, ~1 line). Total: ~30-40 lines of changes.

### SEO Metadata

The `LandingPage.tsx` SEO component includes "Brands" in the page title and description meta tags. These are kept as-is intentionally — changing SEO metadata risks search ranking disruption, and "brands" in a meta tag is not user-visible in the app UI. This will be revisited when brand launches.

### Scroll Anchor

The "For Brands" nav link scrolls to `id="brands"` on `BrandSection`. When both are hidden together, the orphaned anchor is harmless — `scrollToSection` already has a null check for missing targets.

### Existing Sponsorship Data

If any campaign has `open_for_sponsorship=true` in the database from prior testing, the `isSponsored` computation in `CreatorApplicationsCard` and `ApplicationsListFixed` could still trigger joint approval UI. The flag gates these components defensively, but consider resetting test data if needed. The `openForSponsorship` Zod field default is `false`, so new campaigns created while the flag is off will never have sponsorships enabled.

## Re-enabling Brand Role

When the brand role is ready for launch:

1. Change `BRAND_ROLE_ENABLED` to `true` in `src/lib/featureConfig.ts`
2. Push to main
3. Done — all brand UI reappears across landing page, sign-up, and sponsorship features

No other code changes required.

## Testing

### Verify flag = `false` (current state)

- [ ] Landing page: No "For Brands" nav link, no brand CTA buttons, no BrandSection
- [ ] Sign-up page: Only "Restaurant" and "Creator" role options visible, centered layout
- [ ] Campaign creation (restaurant): No "Open for brand sponsorships" checkbox
- [ ] Campaign editing (restaurant): No Brand Sponsorship Settings toggle
- [ ] Campaign details (restaurant/creator): No SponsorshipCard
- [ ] Brand test account login: Dashboard still accessible, all brand pages functional
- [ ] Desktop viewport: Layout correct with brand elements hidden
- [ ] Mobile viewport: Layout correct with brand elements hidden
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes
- [ ] No console errors in Chrome DevTools

### Verify flag = `true` (future re-enable)

- [ ] All brand UI reappears as before
- [ ] No visual regressions on landing page, sign-up, or campaign flows

## Risk Assessment

**Low risk.** Changes are purely additive conditional wrappers around existing JSX. No logic changes, no database changes, no auth changes. Fully reversible by flipping one boolean.

The only layout concern is the sign-up role selection going from 3 cards to 2 — this needs visual verification on both desktop and mobile to ensure the remaining cards center properly.
