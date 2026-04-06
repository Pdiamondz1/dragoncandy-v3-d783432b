# Brand/Sponsor Role — Landing Page & Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Brand/Sponsor role visible and selectable on the landing page, signup flow, and login page.

**Architecture:** UI-only changes across 7 files. The brand role already exists in the DB enum, dashboard pages, route guards, and nav config. We're adding the third role option to CTAs, navigation, role selection, auth form display, and post-signup routing.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Router, Lucide icons, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-06-brand-sponsor-role-landing-auth-design.md`

---

### Task 1: Add Brand CTA to Hero Section

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

- [ ] **Step 1: Add the pink Brand/Sponsor button between the existing two buttons**

In `src/components/landing/HeroSection.tsx`, replace the `<div className="flex flex-col gap-3 ...">` block (lines 18-32) with three buttons. Insert the brand button between the business and creator buttons:

```tsx
<div className="flex flex-col gap-3 w-full max-w-sm mx-auto animate-fade-in-up-delay-3">
  <Button
    className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
    onClick={() => navigate('/auth?mode=signup')}
  >
    I'm a Business — Get Started
  </Button>
  <Button
    className="w-full h-12 rounded-full bg-dc-pink-accent text-white font-bold text-base hover:bg-pink-600 hover:shadow-lg transition-all duration-300"
    onClick={() => navigate('/auth?mode=signup')}
  >
    I'm a Brand/Sponsor — Launch Campaigns
  </Button>
  <Button
    variant="outline"
    className="w-full h-12 rounded-full bg-white text-dc-pink-accent font-semibold text-base border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
    onClick={() => navigate('/auth?mode=signup')}
  >
    I'm a Creator — Join the Marketplace
  </Button>
</div>
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "feat: add brand/sponsor CTA to hero section"
```

---

### Task 2: Add "For Brands" Nav Link to Header

**Files:**
- Modify: `src/components/landing/Header.tsx`

- [ ] **Step 1: Add the "For Brands" entry to the navLinks array**

In `src/components/landing/Header.tsx`, replace the `navLinks` array (lines 15-19) with:

```tsx
const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Businesses", target: "features" },
  { label: "For Brands", target: "brands" },
  { label: "For Creators", target: "cta" },
];
```

This adds the "For Brands" link that scrolls to the `id="brands"` section (created in Task 4). Both desktop and mobile nav render from this same array, so both are updated automatically.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds. The nav link will scroll to `#brands` once the section exists (Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Header.tsx
git commit -m "feat: add 'For Brands' nav link to header"
```

---

### Task 3: Add Brand CTA to Bottom CTA Section

**Files:**
- Modify: `src/components/landing/BottomCTA.tsx`

- [ ] **Step 1: Update copy and add the third button**

Replace the entire content of the `BottomCTA` component in `src/components/landing/BottomCTA.tsx` with:

```tsx
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div id="cta" className="text-center mt-12 md:mt-20 lg:mt-28 mb-12 lg:mb-20 bg-gradient-to-br from-white via-white to-dc-teal/5 rounded-3xl p-6 md:p-10 lg:p-16 shadow-card-elevated border border-dc-teal/20 hover:shadow-glow-teal hover:border-dc-teal/40 transition-all duration-500">
      <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold text-[#111111] mb-4 md:mb-6 tracking-tight">
        Ready to Get Started?
      </h2>
      <p className="text-base md:text-lg lg:text-xl text-[#555555] mb-8 md:mb-12 max-w-xl mx-auto leading-relaxed">
        Whether you're a restaurant, a brand, or a creator — DragonCandy has you covered.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-teal text-white font-bold py-3 text-base lg:text-lg hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Business — Get Started
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-pink-accent text-white font-bold py-3 text-base lg:text-lg hover:bg-pink-600 hover:shadow-lg transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Brand/Sponsor — Launch Campaigns
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
        <Button
          variant="outline"
          className="w-full sm:w-auto sm:px-8 rounded-full bg-white text-dc-pink-accent font-semibold py-3 text-base lg:text-lg border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Creator — Join the Marketplace
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/BottomCTA.tsx
git commit -m "feat: add brand/sponsor CTA to bottom CTA section"
```

---

### Task 4: Create "For Brands & Sponsors" Landing Page Section

**Files:**
- Create: `src/components/landing/BrandSection.tsx`
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Create the BrandSection component**

Create `src/components/landing/BrandSection.tsx`. This follows the same visual patterns as `FeatureSection.tsx` — centered heading, subtext, 3 cards in a grid, and a CTA button. The section element uses `id="brands"` so the nav link from Task 2 can scroll to it.

```tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, BarChart3, Users, ArrowRight } from "lucide-react";

const brandFeatures = [
  {
    icon: <MapPin className="text-dc-teal w-6 h-6" />,
    title: "Multi-Location Campaigns",
    description: "Run coordinated creator campaigns across multiple cities and markets simultaneously.",
  },
  {
    icon: <BarChart3 className="text-dc-teal w-6 h-6" />,
    title: "Performance Analytics",
    description: "Track engagement, reach, and ROI across all your sponsored content in real time.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6" />,
    title: "Managed Creator Network",
    description: "Access vetted, rated creators matched to your brand by audience and content style.",
  },
];

export const BrandSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div id="brands" className="mb-8 md:mb-12">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-[#111111] text-center mb-2">
        For Brands & Sponsors
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12 max-w-lg mx-auto leading-relaxed">
        Scale your creator campaigns across local markets. AI-powered targeting, real-time analytics, and multi-location management.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        {brandFeatures.map((feature) => (
          <div
            key={feature.title}
            className="bg-gray-50 rounded-2xl p-4 flex flex-col items-center text-center gap-2 cursor-default"
          >
            <div className="mb-1 p-2 rounded-xl bg-dc-teal/10">
              {feature.icon}
            </div>
            <h3 className="text-sm font-bold text-[#111111] leading-tight">{feature.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-teal text-white font-bold py-3 text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Launch Your First Campaign
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add BrandSection to LandingPage**

In `src/pages/LandingPage.tsx`, add the import and insert `<BrandSection />` between `<FeatureSection />` and `<BottomCTA />`.

Add import at top (after FeatureSection import, line 5):
```tsx
import { BrandSection } from "@/components/landing/BrandSection";
```

Insert in the `<main>` block (after `<FeatureSection />`, before `<BottomCTA />`):
```tsx
          <BrandSection />
```

The resulting `<main>` block should be:
```tsx
<main className="py-6 md:py-10 lg:py-12">
  <HeroSection />
  <HowItWorks />
  <FeatureSection />
  <BrandSection />
  <BottomCTA />
</main>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds. The "For Brands" nav link now scrolls to this section.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/BrandSection.tsx src/pages/LandingPage.tsx
git commit -m "feat: add 'For Brands & Sponsors' section to landing page"
```

---

### Task 5: Widen Auth Types for Brand Role

All type changes happen in this task first, so subsequent tasks that change UI always build cleanly.

**Files:**
- Modify: `src/pages/AuthPage.tsx`
- Modify: `src/components/auth/AuthForm.tsx`

- [ ] **Step 1: Widen selectedRole state type in AuthPage**

In `src/pages/AuthPage.tsx`, replace line 19:

```tsx
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | null>(null);
```

with:

```tsx
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | "brand" | null>(null);
```

- [ ] **Step 2: Widen handleSelectRole parameter type in AuthPage**

In `src/pages/AuthPage.tsx`, replace line 145:

```tsx
  const handleSelectRole = (role: "business_client" | "content_creator") => {
```

with:

```tsx
  const handleSelectRole = (role: "business_client" | "content_creator" | "brand") => {
```

- [ ] **Step 3: Widen preSelectedRole type in AuthForm**

In `src/components/auth/AuthForm.tsx`, replace line 13:

```tsx
  preSelectedRole?: "business_client" | "content_creator";
```

with:

```tsx
  preSelectedRole?: "business_client" | "content_creator" | "brand";
```

- [ ] **Step 4: Add Megaphone import to AuthForm**

In `src/components/auth/AuthForm.tsx`, replace line 6:

```tsx
import { Eye, EyeOff, Store, Camera } from "lucide-react";
```

with:

```tsx
import { Eye, EyeOff, Store, Camera, Megaphone } from "lucide-react";
```

- [ ] **Step 5: Update the role icon/label display logic in AuthForm**

Replace the binary ternary on lines 225-230:

```tsx
  const roleIcon = preSelectedRole === "content_creator" ? (
    <Camera className="w-4 h-4" />
  ) : (
    <Store className="w-4 h-4" />
  );
  const roleLabel = preSelectedRole === "content_creator" ? "Creator" : "Business";
```

with a function that handles all three roles:

```tsx
  const getRoleDisplay = () => {
    switch (preSelectedRole) {
      case "content_creator":
        return { icon: <Camera className="w-4 h-4" />, label: "Creator" };
      case "brand":
        return { icon: <Megaphone className="w-4 h-4" />, label: "Brand" };
      default:
        return { icon: <Store className="w-4 h-4" />, label: "Business" };
    }
  };
  const { icon: roleIcon, label: roleLabel } = getRoleDisplay();
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: Build succeeds. All types are widened and compatible.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AuthPage.tsx src/components/auth/AuthForm.tsx
git commit -m "feat: widen auth types for brand role in AuthPage and AuthForm"
```

---

### Task 6: Add Brand Card to Role Selection

**Files:**
- Modify: `src/components/auth/RoleSelection.tsx`

- [ ] **Step 1: Widen the role type and add the brand card**

Replace the entire content of `src/components/auth/RoleSelection.tsx` with:

```tsx
import React from "react";
import { Store, Camera, Megaphone } from "lucide-react";

interface RoleSelectionProps {
  onSelectRole: (role: "business_client" | "content_creator" | "brand") => void;
  onBackToLogin: () => void;
}

export const RoleSelection = ({ onSelectRole, onBackToLogin }: RoleSelectionProps) => {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-8">
      <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
        Join DragonCandy
      </h1>
      <p className="text-white/70 text-sm text-center mb-8">
        How will you use DragonCandy?
      </p>

      <div className="w-full max-w-sm md:max-w-md mx-auto flex flex-col gap-4">
        {/* Business card */}
        <button
          type="button"
          onClick={() => onSelectRole("business_client")}
          className="w-full bg-white rounded-2xl border-2 border-teal-400 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-200 flex items-center justify-center flex-shrink-0">
            <Store className="w-7 h-7 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Business</div>
            <div className="text-sm text-gray-500 leading-snug">
              Restaurants & local businesses looking for content
            </div>
          </div>
          <span className="text-teal-400 text-xl flex-shrink-0">&#8250;</span>
        </button>

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

        {/* Creator card — outlined/gray style to distinguish from the two primary roles */}
        <button
          type="button"
          onClick={() => onSelectRole("content_creator")}
          className="w-full bg-white rounded-2xl border-2 border-gray-200 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-200 flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Creator</div>
            <div className="text-sm text-gray-500 leading-snug">
              Content creators looking for gigs
            </div>
          </div>
          <span className="text-gray-300 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Back to login */}
        <div className="mt-6 text-center text-sm">
          <span className="text-white/70">Already have an account? </span>
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-dc-teal font-semibold hover:underline"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
```

Key changes from original:
- Added `Megaphone` import from lucide-react
- Widened `onSelectRole` type to `"business_client" | "content_creator" | "brand"`
- Added Brand/Sponsor card with pink-400 border and Megaphone icon between Business and Creator
- Creator card restyled from pink to gray/outlined (border-gray-200, gray icon gradient, gray chevron) to visually distinguish from the two primary buyer roles
- Business card subtext updated from "Find creators to promote your brand, restaurant, or product" to "Restaurants & local businesses looking for content" for clarity alongside the new brand card

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: Build succeeds (types were already widened in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/RoleSelection.tsx
git commit -m "feat: add brand/sponsor card to role selection"
```

---

### Task 7: Add Brand Routing and Update Login Copy

**Files:**
- Modify: `src/pages/AuthPage.tsx`
- Modify: `src/components/auth/AuthModeToggle.tsx`

- [ ] **Step 1: Add brand case to checkProfileCompletion**

In `src/pages/AuthPage.tsx`, find the block that starts with `if (profile.role === 'content_creator')` (lines 107-126) and add the brand case after it, before the `// Fallback` comment (line 128):

Insert after line 126 (the closing `}` of the content_creator block), before line 128 (`// Fallback`):

```tsx
      if (profile.role === 'brand') {
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!brandProfile?.is_completed) {
          navigate('/profile/brand');
          return;
        }

        // Brand users don't need campaign data migration (only business_client uses migrateCampaignData).
        // Clean up any anonymous data and route to brand dashboard.
        if (hasAnon) {
          localStorage.removeItem('anonymous_campaign_data');
          localStorage.removeItem('anonymous_campaign_final');
        }
        navigate('/dashboard/brand', { replace: true });
        return;
      }
```

- [ ] **Step 2: Update the login page AuthModeToggle to mention all three roles**

In `src/components/auth/AuthModeToggle.tsx`, replace the login mode `if` block (lines 10-24):

```tsx
  if (mode === "login") {
    return (
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-500">Don&apos;t have an account? </span>
        <button
          type="button"
          className="text-dc-pink-accent font-semibold hover:underline disabled:opacity-60"
          onClick={() => onModeChange("signup")}
          disabled={loading}
        >
          Sign Up
        </button>
      </div>
    );
  }
```

with:

```tsx
  if (mode === "login") {
    return (
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-500">New here? </span>
        <button
          type="button"
          className="text-dc-pink-accent font-semibold hover:underline disabled:opacity-60"
          onClick={() => onModeChange("signup")}
          disabled={loading}
        >
          Sign up
        </button>
        <span className="text-gray-500"> as a Business, Brand, or Creator</span>
      </div>
    );
  }
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AuthPage.tsx src/components/auth/AuthModeToggle.tsx
git commit -m "feat: add brand routing and update login copy to mention all roles"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run a clean build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Run dev server and manually verify**

Run: `npm run dev`

Verify:
1. Landing page hero shows 3 CTA buttons (teal Business, pink Brand, outlined Creator)
2. Header nav shows "For Brands" link between "For Businesses" and "For Creators"
3. "For Brands" nav link scrolls to the new "For Brands & Sponsors" section
4. Brand section shows 3 feature cards and a "Launch Your First Campaign" CTA
5. Bottom CTA shows 3 buttons and updated copy mentioning brands
6. Clicking any CTA navigates to `/auth?mode=signup`
7. Role selection screen shows 3 cards (Business/Brand/Creator)
8. Selecting "Brand/Sponsor" shows signup form with Megaphone icon and "Brand" label
9. Login page shows "New here? Sign up as a Business, Brand, or Creator"
10. All 3 role cards are visible and tappable on mobile viewport (375px)

- [ ] **Step 3: Create final commit**

```bash
git add -A
git commit -m "auth: brand/sponsor role added to landing page and signup"
```

Note: Only run this if there are any uncommitted changes from prior tasks. If all tasks committed cleanly, this step is a no-op.
