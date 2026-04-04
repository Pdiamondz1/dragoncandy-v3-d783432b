# Landing Page Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the DragonCandy landing page to clearly communicate what the platform does, with role-specific CTAs for businesses and creators.

**Architecture:** Edit-in-place approach — modify 5 existing components and add 1 new component (`HowItWorks.tsx`). The page structure becomes: Header → Hero → HowItWorks → FeatureCards → BottomCTA → PortfolioStrip.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons, react-router-dom

**Spec:** `docs/superpowers/specs/2026-04-01-landing-page-rewrite-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/landing/Header.tsx` | Edit | Nav links → anchor scroll + updated mobile drawer |
| `src/components/landing/HeroSection.tsx` | Edit | New headline, subheadline, dual CTAs |
| `src/components/landing/HowItWorks.tsx` | Create | New 3-step section component |
| `src/components/landing/FeatureSection.tsx` | Edit | Unique card copy, section heading, mobile layout |
| `src/components/landing/BottomCTA.tsx` | Edit | New CTA copy, dual buttons |
| `src/pages/LandingPage.tsx` | Edit | Import and render HowItWorks |

---

### Task 1: Update Header Navigation

**Files:**
- Modify: `src/components/landing/Header.tsx`

- [ ] **Step 1: Update desktop nav links**

Replace the current nav links and add a scroll handler. Replace the entire file content:

```tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import dragonCandyLogo from "@/assets/Transparent_DragonCandy_logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Businesses", target: "features" },
  { label: "For Creators", target: "cta" },
];

export const Header: React.FC = () => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between py-4 bg-white animate-fade-in">
      <img
        src={dragonCandyLogo}
        alt="DragonCandy"
        className="h-12 w-12 cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={() => navigate('/')}
      />

      {/* Desktop nav links — hidden on mobile */}
      <nav className="hidden md:flex items-center gap-8">
        {navLinks.map((link) => (
          <button
            key={link.target}
            onClick={() => scrollToSection(link.target)}
            className="text-sm font-medium text-[#555555] hover:text-dc-teal transition-colors duration-200 bg-transparent border-none cursor-pointer"
          >
            {link.label}
          </button>
        ))}
        <Button
          variant="ghost"
          className="rounded-full text-[#555555] hover:text-dc-teal font-medium"
          onClick={() => navigate('/auth?mode=login')}
        >
          Login
        </Button>
        <Button
          className="rounded-full bg-dc-teal text-white font-semibold px-6 hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </Button>
      </nav>

      {/* Mobile hamburger */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6 text-gray-600" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 pt-8">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <SheetClose asChild key={link.target}>
                  <button
                    onClick={() => scrollToSection(link.target)}
                    className="w-full text-left px-4 py-2 rounded-full text-[#555555] hover:text-dc-teal font-medium bg-transparent border-none cursor-pointer"
                  >
                    {link.label}
                  </button>
                </SheetClose>
              ))}
              <hr className="border-gray-200 my-1" />
              <Button
                variant="ghost"
                className="w-full justify-start rounded-full text-[#555555] hover:text-dc-teal"
                onClick={() => navigate('/auth?mode=login')}
              >
                Login
              </Button>
              <Button
                className="w-full rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal-dark"
                onClick={() => navigate('/auth?mode=signup')}
              >
                Get Started
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Header.tsx
git commit -m "landing: update header nav with anchor scroll links"
```

---

### Task 2: Update Hero Section

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

- [ ] **Step 1: Replace hero content**

Replace the entire file content:

```tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-8 md:py-16 lg:py-24 animate-fade-in-up bg-gradient-to-b from-white to-gray-50">
      <h1 className="text-2xl md:text-4xl lg:text-6xl font-extrabold uppercase tracking-wide text-dc-teal text-center mb-5 leading-tight animate-fade-in-up-delay-1">
        Local Content. Created Fast. Powered by AI.
      </h1>

      <p className="text-base text-gray-500 text-center mt-4 mb-8 leading-relaxed max-w-sm md:max-w-lg mx-auto animate-fade-in-up-delay-2">
        DragonCandy connects restaurants and local businesses with vetted content creators. Get professional social media content in hours, not weeks.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-sm mx-auto animate-fade-in-up-delay-3">
        <Button
          className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Business — Get Started
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 rounded-full bg-white text-dc-pink-accent font-semibold text-base border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Creator — Join the Marketplace
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "landing: update hero with clear value proposition and dual CTAs"
```

---

### Task 3: Create HowItWorks Component

**Files:**
- Create: `src/components/landing/HowItWorks.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from "react";

const steps = [
  {
    number: 1,
    title: "Describe Your Campaign",
    description:
      "Tell Donny what you need. Paste your website URL and get a complete campaign brief in seconds.",
  },
  {
    number: 2,
    title: "Get Matched with Creators",
    description:
      "Our AI scores and matches you with local creators based on style, audience, and track record.",
  },
  {
    number: 3,
    title: "Content Delivered Fast",
    description:
      "Choose DragonDash for content in hours, or standard delivery in days. Approve, pay, done.",
  },
];

export const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="bg-gray-50 -mx-4 md:-mx-8 lg:-mx-12 px-4 md:px-8 lg:px-12 py-10 md:py-16 lg:py-20 mb-8 animate-fade-in-up">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-[#111111] text-center mb-2">
        How It Works
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12">
        Get professional content in 3 simple steps
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {steps.map((step) => (
          <div
            key={step.number}
            className="bg-white rounded-2xl p-6 border border-gray-200"
          >
            {/* Mobile: inline number + title */}
            <div className="flex items-center gap-3 mb-3 md:flex-col md:items-center md:text-center md:gap-4">
              <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-dc-teal text-white font-extrabold text-sm md:text-lg flex items-center justify-center flex-shrink-0">
                {step.number}
              </div>
              <h3 className="text-base md:text-lg font-bold text-[#111111]">
                {step.title}
              </h3>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed pl-12 md:pl-0 md:text-center">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. Component compiles without errors. (Not rendered yet — that's Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HowItWorks.tsx
git commit -m "landing: add HowItWorks 3-step section component"
```

---

### Task 4: Update Feature Section

**Files:**
- Modify: `src/components/landing/FeatureSection.tsx`

- [ ] **Step 1: Replace feature section with unique copy and section heading**

Replace the entire file content:

```tsx
import { Sparkles, Users, Zap } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-dc-teal w-6 h-6" />,
    title: "AI-Powered Campaigns",
    description:
      "Donny generates complete campaign briefs from your website URL. Target audience, content style, posting schedule — all automated.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6" />,
    title: "Vetted Creator Network",
    description:
      "Every creator is scored on engagement, reliability, and content quality. No guesswork.",
  },
  {
    icon: <Zap className="text-dc-teal w-6 h-6" />,
    title: "DragonDash Rush Delivery",
    description:
      "Need content today? DragonDash connects you with available creators for same-day turnaround.",
  },
];

export const FeatureSection = () => {
  return (
    <div id="features" className="mb-8 animate-fade-in-up-delay-3">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-[#111111] text-center mb-2">
        Why DragonCandy
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12">
        Everything you need to get great content, fast
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No type errors. `TrendingUp` import is removed.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/FeatureSection.tsx
git commit -m "landing: unique feature card copy and section heading"
```

---

### Task 5: Update Bottom CTA

**Files:**
- Modify: `src/components/landing/BottomCTA.tsx`

- [ ] **Step 1: Replace bottom CTA with dual buttons**

Replace the entire file content:

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
        Whether you're a restaurant looking for content or a creator looking for work — DragonCandy has you covered.
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/BottomCTA.tsx
git commit -m "landing: update bottom CTA with dual role-specific buttons"
```

---

### Task 6: Wire Up LandingPage

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Import HowItWorks and add to page**

Replace the entire file content:

```tsx
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { PortfolioStrip } from "@/components/landing/PortfolioStrip";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (!loading && user) {
      console.log('🔄 LandingPage: Authenticated user detected, redirecting to dashboard...');
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-white relative overflow-x-hidden">
      {/* Main content — mobile-first, scales up elegantly on desktop */}
      <div className="relative z-10 max-w-md md:max-w-2xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-8 lg:px-12">
        <Header />

        <main className="py-6 md:py-10 lg:py-12">
          <HeroSection />
          <HowItWorks />
          <FeatureSection />
          <BottomCTA />
        </main>
      </div>

      {/* Portfolio image strip — edge-to-edge at the bottom */}
      <PortfolioStrip />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. All imports resolve.

- [ ] **Step 3: Visual verification**

Run: `npm run dev`

Check at 375px (mobile):
- Header: logo + hamburger. Drawer has all 5 items.
- Hero: headline on 3 lines, stacked buttons.
- How It Works: 3 stacked cards with inline number badges.
- Feature cards: 3 stacked cards with unique copy.
- Bottom CTA: stacked dual buttons.
- PortfolioStrip: marquee scrolls.

Check at 1440px (desktop):
- Header: logo + 3 anchor links + Login + Get Started button.
- Hero: headline on 1 line, stacked buttons centered.
- How It Works: 3-column grid.
- Feature cards: 3-column grid.
- Bottom CTA: side-by-side buttons.

Check anchor links:
- Click "How It Works" → smooth scrolls to #how-it-works section.
- Click "For Businesses" → smooth scrolls to #features section.
- Click "For Creators" → smooth scrolls to #cta section.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "landing: professional landing page with clear value proposition"
```

---

### Task 7: Final Build Verification

- [ ] **Step 1: Clean build**

Run: `npm run build`
Expected: Build succeeds with no errors or warnings related to landing page components.

- [ ] **Step 2: Verify no other pages affected**

Confirm these files were NOT modified:
- `src/pages/Index.tsx`
- `src/components/landing/PortfolioStrip.tsx`
- Any file outside `src/components/landing/` and `src/pages/LandingPage.tsx`

Run: `git diff --name-only`
Expected output should only show:
```
src/components/landing/Header.tsx
src/components/landing/HeroSection.tsx
src/components/landing/HowItWorks.tsx
src/components/landing/FeatureSection.tsx
src/components/landing/BottomCTA.tsx
src/pages/LandingPage.tsx
```
