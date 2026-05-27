# Hide Brand Role via Feature Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Brand/Sponsor role from all public-facing UI and sponsorship features behind a single `BRAND_ROLE_ENABLED` constant, while preserving full brand dashboard access for existing accounts.

**Architecture:** A new `src/lib/featureConfig.ts` exports `BRAND_ROLE_ENABLED = false`. Each public-facing component that renders brand or sponsorship UI imports this flag and conditionally hides the relevant JSX. No database, route, or auth changes — purely UI gating.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-26-hide-brand-role-feature-flag-design.md`

---

### Task 1: Create Feature Flag Config

**Files:**
- Create: `src/lib/featureConfig.ts`

- [ ] **Step 1: Create the feature flag file**

```typescript
// src/lib/featureConfig.ts
export const BRAND_ROLE_ENABLED = false;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -5`
Expected: No errors related to featureConfig

- [ ] **Step 3: Commit**

```bash
git add src/lib/featureConfig.ts
git commit -m "feat: add BRAND_ROLE_ENABLED feature flag constant"
```

---

### Task 2: Hide Brand from Landing Page Header

**Files:**
- Modify: `src/components/landing/Header.tsx:14-19` (navLinks array)

The `navLinks` array at line 14 includes `{ label: "For Brands", target: "brands" }`. Both the desktop nav (line 50) and mobile sheet nav (line 87) iterate over this same array, so filtering it once hides the link from both viewports.

- [ ] **Step 1: Add feature flag import and filter navLinks**

Add at the top of the file, after the existing imports:

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

Then below the `navLinks` const (after line 19), add:

```typescript
const visibleNavLinks = BRAND_ROLE_ENABLED
  ? navLinks
  : navLinks.filter((l) => l.target !== 'brands');
```

- [ ] **Step 2: Replace `navLinks` with `visibleNavLinks` in both render loops**

In the desktop nav (line 50), change:
```typescript
{navLinks.map((link) => (
```
to:
```typescript
{visibleNavLinks.map((link) => (
```

In the mobile sheet nav (line 87), change:
```typescript
{navLinks.map((link) => (
```
to:
```typescript
{visibleNavLinks.map((link) => (
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Header.tsx
git commit -m "feat: hide 'For Brands' nav link behind feature flag"
```

---

### Task 3: Hide Brand CTA from Hero Section

**Files:**
- Modify: `src/components/landing/HeroSection.tsx:32-37` (brand CTA button)

The third Button (lines 32–37) reads "I'm a Brand/Sponsor — Launch Campaigns" with a pink accent style. Wrap it in a conditional.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (after line 3):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Wrap the brand CTA button in a conditional**

Change lines 32–37 from:
```tsx
        <Button
          className="w-full h-12 rounded-full bg-dc-pink-accent-btn text-white font-bold text-base hover:bg-dc-pink-accent-btn-hover hover:shadow-lg transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Brand/Sponsor — Launch Campaigns
        </Button>
```
to:
```tsx
        {BRAND_ROLE_ENABLED && (
          <Button
            className="w-full h-12 rounded-full bg-dc-pink-accent-btn text-white font-bold text-base hover:bg-dc-pink-accent-btn-hover hover:shadow-lg transition-all duration-300"
            onClick={() => navigate('/auth?mode=signup')}
          >
            I'm a Brand/Sponsor — Launch Campaigns
          </Button>
        )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "feat: hide brand CTA from hero section behind feature flag"
```

---

### Task 4: Hide BrandSection from Landing Page

**Files:**
- Modify: `src/pages/LandingPage.tsx:8,38` (BrandSection import and render)

Gate the `<BrandSection />` render at the call site in `LandingPage.tsx` (line 38) rather than inside the component. This eliminates import/render overhead when the flag is off.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (e.g., after line 12):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Wrap BrandSection render in conditional**

Change line 38 from:
```tsx
          <BrandSection />
```
to:
```tsx
          {BRAND_ROLE_ENABLED && <BrandSection />}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "feat: hide BrandSection from landing page behind feature flag"
```

---

### Task 5: Hide Brand CTA and Copy from BottomCTA

**Files:**
- Modify: `src/components/landing/BottomCTA.tsx:13-14,24-30` (paragraph text and brand button)

Two changes needed:
1. Line 14: Paragraph text says "Whether you're a restaurant, a brand, or a creator" — conditionally render brand-inclusive vs brand-exclusive copy.
2. Lines 24–30: The "I'm a Brand/Sponsor — Launch Campaigns" button — hide when flag is off.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (after line 3):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Conditionally render paragraph text**

Change line 13–14 from:
```tsx
      <p className="text-base md:text-lg lg:text-xl text-dc-text-muted mb-8 md:mb-12 max-w-xl mx-auto leading-relaxed">
        Whether you're a restaurant, a brand, or a creator — DragonCandy has you covered.
      </p>
```
to:
```tsx
      <p className="text-base md:text-lg lg:text-xl text-dc-text-muted mb-8 md:mb-12 max-w-xl mx-auto leading-relaxed">
        {BRAND_ROLE_ENABLED
          ? "Whether you're a restaurant, a brand, or a creator — DragonCandy has you covered."
          : "Whether you're a restaurant or a creator — DragonCandy has you covered."}
      </p>
```

- [ ] **Step 3: Wrap the brand CTA button in a conditional**

Change lines 24–30 from:
```tsx
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-pink-accent-btn text-white font-bold py-3 text-base lg:text-lg hover:bg-dc-pink-accent-btn-hover hover:shadow-lg transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Brand/Sponsor — Launch Campaigns
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
```
to:
```tsx
        {BRAND_ROLE_ENABLED && (
          <Button
            className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-pink-accent-btn text-white font-bold py-3 text-base lg:text-lg hover:bg-dc-pink-accent-btn-hover hover:shadow-lg transition-all duration-300 group"
            onClick={() => navigate('/auth?mode=signup')}
          >
            I'm a Brand/Sponsor — Launch Campaigns
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        )}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/BottomCTA.tsx
git commit -m "feat: hide brand CTA and copy from BottomCTA behind feature flag"
```

---

### Task 6: Hide Brand Role from Sign-Up

**Files:**
- Modify: `src/components/auth/RoleSelection.tsx:37-53` (brand/sponsor card)

The brand role card (lines 37–53) is the middle of three role buttons. When hidden, the flex column layout naturally reflows to show just two cards.

- [ ] **Step 1: Add feature flag import**

Add after the existing import (after line 1):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Wrap the brand/sponsor card in a conditional**

Change lines 37–53 from:
```tsx
        {/* Brand/Sponsor card */}
        <button
          type="button"
          onClick={() => onSelectRole("brand")}
          className="w-full bg-white rounded-2xl border-2 border-pink-400 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-50 to-pink-200 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-7 h-7 text-pink-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Brand/Sponsor</div>
            <div className="text-sm text-gray-500 leading-snug">
              Brands running sponsored creator campaigns
            </div>
          </div>
          <span className="text-pink-400 text-xl flex-shrink-0">&#8250;</span>
        </button>
```
to:
```tsx
        {/* Brand/Sponsor card — hidden behind feature flag */}
        {BRAND_ROLE_ENABLED && (
          <button
            type="button"
            onClick={() => onSelectRole("brand")}
            className="w-full bg-white rounded-2xl border-2 border-pink-400 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-50 to-pink-200 flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-7 h-7 text-pink-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-gray-900">I'm a Brand/Sponsor</div>
              <div className="text-sm text-gray-500 leading-snug">
                Brands running sponsored creator campaigns
              </div>
            </div>
            <span className="text-pink-400 text-xl flex-shrink-0">&#8250;</span>
          </button>
        )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/RoleSelection.tsx
git commit -m "feat: hide brand role card from sign-up behind feature flag"
```

---

### Task 7: Hide Sponsorship Checkbox from Campaign Creation

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx:576-616` (sponsorship FormField)

The "Open for brand sponsorships" checkbox is a `FormField` (lines 576–616) with `name="openForSponsorship"`. Wrap the entire FormField in a conditional. The Zod schema default is `false`, so hidden campaigns will always have `openForSponsorship: false`.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (e.g., after line 28):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Wrap the sponsorship FormField in a conditional**

Change line 576 (the comment `{/* Open for Sponsorship Option */}`) through line 616 (the closing `/>` of the FormField):

Before:
```tsx
              {/* Open for Sponsorship Option */}
              <FormField
                control={form.control}
                name="openForSponsorship"
                render={({ field }) => (
```

After:
```tsx
              {/* Open for Sponsorship Option — hidden behind feature flag */}
              {BRAND_ROLE_ENABLED && (
                <FormField
                  control={form.control}
                  name="openForSponsorship"
                  render={({ field }) => (
```

And after line 616 (the closing of the FormField's `/>` — which is actually `)}` on line 616):

Add a closing `)}` for the conditional wrapper. The exact location is the line that closes the `<FormField ... />` element — add `)}` after it to close the `{BRAND_ROLE_ENABLED && (` wrapper.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "feat: hide sponsorship checkbox from campaign creation behind feature flag"
```

---

### Task 8: Hide Sponsorship Toggle from Campaign Editing

**Files:**
- Modify: `src/components/campaigns/CampaignSponsorshipToggle.tsx:13-71` (entire component return)

The component is used only in `CampaignEditPage.tsx`. Rather than modifying the consuming page, make the component return `null` when the flag is off. This hides it everywhere it's used.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (after line 6):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Add early return when flag is off**

Add immediately after the opening of the component function (after line 16, before the `return` on line 17):

```typescript
  if (!BRAND_ROLE_ENABLED) return null;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignSponsorshipToggle.tsx
git commit -m "feat: hide sponsorship toggle from campaign editing behind feature flag"
```

---

### Task 9: Hide SponsorshipCard from Campaign Details

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx:35,482-484` (import and render)

The `SponsorshipCard` is imported at line 35 and rendered at lines 482–484 inside a conditional `{campaign.open_for_sponsorship && <SponsorshipCard ... />}`. Add the feature flag as an additional condition.

- [ ] **Step 1: Add feature flag import**

Add after the existing imports (e.g., after line 35):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Add feature flag to the SponsorshipCard conditional**

Change lines 482–484 from:
```tsx
            {campaign.open_for_sponsorship && (
              <SponsorshipCard campaignId={campaign.id} />
            )}
```
to:
```tsx
            {BRAND_ROLE_ENABLED && campaign.open_for_sponsorship && (
              <SponsorshipCard campaignId={campaign.id} />
            )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: hide SponsorshipCard from campaign details behind feature flag"
```

---

### Task 10: Hide Joint Approval UI from Applications

**Files:**
- Modify: `src/components/campaigns/CreatorApplicationsCard.tsx:139-144` (JointApprovalCard render)
- Modify: `src/components/campaigns/ApplicationsListFixed.tsx:247-248` (isSponsored prop)

Both files pass `isSponsored` to `JointApprovalCard`/`ApplicationCard`. Gate the sponsorship logic so it evaluates to `false` when the flag is off.

- [ ] **Step 1: Add feature flag import to CreatorApplicationsCard**

Add after the existing imports (after line 12):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 2: Gate isSponsored in CreatorApplicationsCard**

Change line 41 from:
```typescript
  const isSponsored = (campaign?.open_for_sponsorship && hasActiveSponsor) || false;
```
to:
```typescript
  const isSponsored = (BRAND_ROLE_ENABLED && campaign?.open_for_sponsorship && hasActiveSponsor) || false;
```

- [ ] **Step 3: Add feature flag import to ApplicationsListFixed**

Add after the existing imports (after line 18):

```typescript
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
```

- [ ] **Step 4: Gate isSponsored in ApplicationsListFixed**

Change line 53 from:
```typescript
  const isSponsored = (campaign?.open_for_sponsorship && hasActiveSponsor) || false;
```
to:
```typescript
  const isSponsored = (BRAND_ROLE_ENABLED && campaign?.open_for_sponsorship && hasActiveSponsor) || false;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/CreatorApplicationsCard.tsx src/components/campaigns/ApplicationsListFixed.tsx
git commit -m "feat: hide joint approval UI from applications behind feature flag"
```

---

### Task 11: Final Build Verification and Production Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Visual verification — Landing page (desktop + mobile)**

Open `http://127.0.0.1:8080` in browser. Verify on the landing page:
- No "For Brands" link in header nav (desktop and mobile hamburger)
- No "I'm a Brand/Sponsor — Launch Campaigns" button in hero section
- No "For Brands & Sponsors" marketing section
- No "I'm a Brand/Sponsor" button in bottom CTA
- Bottom CTA paragraph reads "Whether you're a restaurant or a creator — DragonCandy has you covered."
- Layout looks correct with brand elements removed (no gaps, no broken spacing)
- Check both desktop (>768px) and mobile (<768px) viewports

- [ ] **Step 5: Visual verification — Sign-up page (desktop + mobile)**

Navigate to `/auth?mode=signup`. Verify:
- Only "I'm a Restaurant" and "I'm a Creator" role cards shown
- No "I'm a Brand/Sponsor" card
- Two cards are centered and have balanced spacing
- Check both desktop and mobile viewports

- [ ] **Step 6: Visual verification — Campaign creation (restaurant account)**

Log in with restaurant account (`dwilliams@harbormill.net`). Navigate to campaign creation flow and reach the finalize step. Verify:
- No "Open for brand sponsorships" checkbox visible
- All other campaign creation fields work normally

- [ ] **Step 7: Visual verification — Campaign editing (restaurant account)**

Navigate to an existing campaign's edit page (restaurant account). Verify:
- No "Brand Sponsorship Settings" toggle card visible
- All other campaign editing fields work normally

- [ ] **Step 8: Visual verification — Campaign details (restaurant account)**

Navigate to a campaign details page (restaurant account). Verify:
- No SponsorshipCard visible (even if `open_for_sponsorship` was previously true)
- All other campaign details render correctly

- [ ] **Step 9: Visual verification — Brand dashboard (brand account)**

Log in with brand account (`damesonpoint@gmail.com`). Verify:
- Brand dashboard still loads at `/dashboard/brand`
- Navigation works (sidebar, bottom nav)
- Brand-specific pages are still accessible

- [ ] **Step 10: Check Chrome DevTools console**

On each verified page, open Chrome DevTools and confirm:
- No console errors
- No React warnings related to the feature flag changes

- [ ] **Step 11: After production deploy — verify on dragoncandy.io**

After push to main and Lovable.dev deploy:
- Take screenshots of landing page, sign-up page on dragoncandy.io
- Verify brand elements are hidden in production
- Check Chrome DevTools for console errors
- Test both desktop and mobile viewports
