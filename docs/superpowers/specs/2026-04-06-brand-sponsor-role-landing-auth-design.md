# Brand/Sponsor Role — Landing Page & Auth Flow

## Problem

DragonCandy has three distinct user roles: Business Client, Brand/Sponsor, and Content Creator. The Brand/Sponsor role is fully implemented in the backend (DB enum, dashboard pages, route guards, nav config) but completely invisible on the landing page, signup flow, and login page. Brands are a key revenue stream ($499-2,000/mo) and cannot currently discover or sign up for the platform.

## Scope

Add Brand/Sponsor as a visible, selectable role across the public-facing pages. No dashboard, campaign, or Supabase schema changes.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/landing/HeroSection.tsx` | Add 3rd Brand CTA button |
| `src/components/landing/Header.tsx` | Add "For Brands" nav link |
| `src/components/landing/BottomCTA.tsx` | Add 3rd Brand CTA + update copy |
| `src/pages/LandingPage.tsx` | Add "For Brands & Sponsors" section (id="brands") |
| `src/components/auth/RoleSelection.tsx` | Add 3rd Brand card, widen SelectedRole type |
| `src/components/auth/AuthForm.tsx` | Widen `preSelectedRole` type to include `'brand'`, update role icon/label display |
| `src/pages/AuthPage.tsx` | Widen `selectedRole`/`handleSelectRole` types, add brand routing + login copy |

## Design

### 1. Hero Section (`HeroSection.tsx`)

Replace the current 2-button layout with 3 CTA buttons:

- **"I'm a Business — Get Started"** — teal solid button, links to `/auth?mode=signup`
- **"I'm a Brand/Sponsor — Launch Campaigns"** — pink solid button, links to `/auth?mode=signup`
- **"I'm a Creator — Join the Marketplace"** — outlined button, links to `/auth?mode=signup`

All three link to the role selection screen (no URL-based role pre-selection — users always pick their role on the selection screen).

Responsive layout: stack vertically on mobile, row on desktop.

### 2. Navigation (`Header.tsx`)

Add "For Brands" link between "For Businesses" and "For Creators" in both desktop and mobile nav. The link scrolls to the new "For Brands & Sponsors" section via `scrollToSection("brands")`.

### 3. New Landing Page Section: "For Brands & Sponsors"

Insert after the existing Features section, before Bottom CTA. Section element uses `id="brands"` for nav scroll targeting.

- **Headline:** "Scale Your Creator Campaigns Across Local Markets"
- **Subtext:** "Run sponsored content campaigns with vetted local creators. AI-powered targeting, real-time analytics, and multi-location management."
- **3 mini-feature cards:**
  - "Multi-Location Campaigns" — Run across cities
  - "Performance Analytics" — Track engagement & ROI
  - "Managed Creator Network" — Vetted, rated creators
- **CTA:** "Launch Your First Campaign" (teal solid) linking to `/auth?mode=signup`

**Color rationale:** Section-level CTAs use teal for consistency with the site's primary action color. Hero and bottom CTAs use role-specific colors (teal for business, pink for brand, outlined for creator) for visual differentiation.

Visual style matches existing landing page sections (same spacing, typography, card patterns).

### 4. Bottom CTA (`BottomCTA.tsx`)

Update to 3 CTA buttons matching the hero section pattern. Update copy to mention brands alongside businesses and creators (e.g., "Whether you're a restaurant, a brand, or a creator...").

### 5. Role Selection (`RoleSelection.tsx`)

Add a 3rd card to the signup role selection screen:

| Card | Icon | Border Color | Subtext |
|------|------|-------------|---------|
| I'm a Business | Store | Teal | Restaurants & local businesses looking for content |
| I'm a Brand/Sponsor | Megaphone | Pink | Brands running sponsored creator campaigns |
| I'm a Creator | Camera | Outlined (gray) | Content creators looking for gigs |

Type update — `SelectedRole` union adds `'brand'`:
```typescript
type SelectedRole = "business_client" | "content_creator" | "brand" | null;
```

Cards should stack on mobile and display in a row on desktop. Match existing card styling patterns.

### 6. Auth Form (`AuthForm.tsx`)

Widen the `preSelectedRole` prop type to include `'brand'`:
```typescript
preSelectedRole?: "business_client" | "content_creator" | "brand";
```

Update the role icon/label display logic (currently a binary ternary) to handle three roles:
- `business_client` → Store icon, "Business" label
- `brand` → Megaphone icon, "Brand" label
- `content_creator` → Camera icon, "Creator" label

### 7. Auth Page — Post-Signup Routing (`AuthPage.tsx`)

Widen inline union types for `selectedRole` state and `handleSelectRole` parameter to include `'brand'`.

Add brand case to the profile completion redirect logic, following the existing pattern (check `business_profiles.is_completed` since brand users use the same table with `account_type='brand'`):
```typescript
} else if (profile.role === 'brand') {
  // Check business_profiles.is_completed for brand users (same table, account_type='brand')
  if (!businessProfile?.is_completed) {
    navigate('/profile/brand');
  } else {
    navigate('/dashboard/brand');
  }
}
```

### 8. Login Page (`AuthPage.tsx`, login mode)

Replace the existing `AuthModeToggle` "Don't have an account? Sign up" text with:
**"New here? Sign up as a Business, Brand, or Creator"**
— "Sign up" is a link to `/auth?mode=signup`

This replaces (not supplements) the existing signup prompt to avoid duplicate CTAs.

## Existing Infrastructure (no changes needed)

- `profiles.role` enum already includes `'brand'`
- `business_profiles.account_type` already supports `'brand'`
- `BrandRoute.tsx` guards brand dashboard routes
- `BrandProfileSetup.tsx` handles brand onboarding
- `navConfig.ts` already has brand bottom nav and sidebar nav
- Brand dashboard pages all exist (`BrandDashboard`, `BrandSponsorships`, `BrandAnalytics`, etc.)

## Constraints

- Do NOT modify dashboards or campaign flows
- Do NOT change Supabase auth logic or DB schema
- Preserve existing desktop `lg:` Tailwind classes
- All 3 roles must be selectable on mobile

## Verification

- `npm run build` succeeds
- All 3 roles visible and selectable in signup flow
- Landing page shows brand section and CTAs
- Login page mentions all 3 roles
- Commit: `auth: brand/sponsor role added to landing page and signup`
