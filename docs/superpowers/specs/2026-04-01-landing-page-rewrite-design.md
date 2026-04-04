# Landing Page Rewrite — Design Spec

**Date:** 2026-04-01
**Scope:** Landing page only (`/landing` route). No changes to login, dashboard, or any other page.
**Approach:** Edit-in-place — modify existing components, add one new component.

---

## Problem

The current landing page has:
- A generic hero headline ("Unleash Your Creativity") that doesn't communicate what the platform does
- 3 feature cards with identical placeholder copy
- No clear value proposition for the primary audience (restaurants and local businesses)
- No differentiated CTAs for the two user types (businesses vs. creators)

## Goal

Convert restaurant owners and content creators by clearly communicating what DragonCandy does, how it works, and why it's fast.

---

## Page Structure

The page renders in this order:

1. **Header** (navigation)
2. **HeroSection** (headline, subheadline, dual CTAs)
3. **HowItWorks** (3 numbered steps) — new component
4. **FeatureSection** (3 feature cards with unique copy)
5. **BottomCTA** ("Ready to Get Started?" + dual CTAs)
6. **PortfolioStrip** (existing DragonFeed marquee — unchanged)

---

## Section 1: Header

**File:** `src/components/landing/Header.tsx` (edit)

### Desktop Nav
```
[DC Logo]   How It Works | For Businesses | For Creators | Login | [Get Started]
```

- **How It Works** → anchor `#how-it-works` (smooth scroll)
- **For Businesses** → anchor `#features` (smooth scroll)
- **For Creators** → anchor `#cta` (smooth scroll)
- **Login** → `/auth?mode=login` (unchanged behavior)
- **Get Started** → `/auth?mode=signup` (unchanged behavior)

### Mobile Nav
- Logo + hamburger (unchanged layout)
- Drawer now includes: How It Works, For Businesses, For Creators, Login, Get Started
- Anchor links close the drawer and smooth-scroll to target

### Smooth Scrolling
Use `scrollIntoView({ behavior: 'smooth' })` on anchor click. Avoid CSS `scroll-behavior: smooth` on the root to prevent side effects on other pages.

---

## Section 2: Hero

**File:** `src/components/landing/HeroSection.tsx` (edit)

### Content
- **Headline:** "Local Content. Created Fast. Powered by AI."
- **Subheadline:** "DragonCandy connects restaurants and local businesses with vetted content creators. Get professional social media content in hours, not weeks."
- **CTA 1 (teal, primary):** "I'm a Business — Get Started" → `/auth?mode=signup`
- **CTA 2 (outline, secondary):** "I'm a Creator — Join the Marketplace" → `/auth?mode=signup`

### Styling
- Headline: `text-dc-teal`, uppercase, bold, existing responsive sizing
- Subheadline: `text-gray-500`, max-width constrained
- Background: subtle gradient `bg-gradient-to-b from-white to-gray-50`
- Animations: preserve existing staggered `fade-in-up` delays on headline, subtext, buttons

### Changes from Current
- Headline text replaced
- Subheadline text replaced
- "Get Started" button → "I'm a Business — Get Started"
- "Learn More" button → "I'm a Creator — Join the Marketplace"

---

## Section 3: How It Works

**File:** `src/components/landing/HowItWorks.tsx` (new)

### Content
Three numbered steps:

1. **"Describe Your Campaign"** — "Tell Donny what you need. Paste your website URL and get a complete campaign brief in seconds."
2. **"Get Matched with Creators"** — "Our AI scores and matches you with local creators based on style, audience, and track record."
3. **"Content Delivered Fast"** — "Choose DragonDash for content in hours, or standard delivery in days. Approve, pay, done."

### Styling
- Section heading: "How It Works" (uppercase, bold, dark) + subtitle "Get professional content in 3 simple steps"
- Anchor: `id="how-it-works"`
- Background: `bg-gray-50` full-width section padding
- **Mobile:** Stacked cards, each with inline number badge + title, indented description
- **Desktop:** 3-column grid, centered cards with number badge above title
- Number badges: `w-9 h-9 rounded-full bg-dc-teal text-white font-extrabold` (mobile), slightly larger on desktop
- Cards: white background, `rounded-2xl`, `border border-gray-200`, consistent padding

### Animation
- Fade-in-up on scroll entry (reuse existing animation classes)

---

## Section 4: Feature Cards

**File:** `src/components/landing/FeatureSection.tsx` (edit)
**File:** `src/components/landing/FeatureCard.tsx` (edit)

### Content
Three cards with unique copy:

1. **Sparkles icon** — **"AI-Powered Campaigns"** — "Donny generates complete campaign briefs from your website URL. Target audience, content style, posting schedule — all automated."
2. **Users icon** — **"Vetted Creator Network"** — "Every creator is scored on engagement, reliability, and content quality. No guesswork."
3. **Zap icon** — **"DragonDash Rush Delivery"** — "Need content today? DragonDash connects you with available creators for same-day turnaround."

### Styling
- Section heading added: "Why DragonCandy" (uppercase, bold, dark) + subtitle "Everything you need to get great content, fast"
- Anchor: `id="features"` (already exists)
- Background: white (contrasts with gray How It Works above)
- **Mobile:** Stack cards vertically (`grid-cols-1`) instead of current `grid-cols-3`
- **Desktop:** 3-column grid (unchanged)
- Cards: keep existing `FeatureCard` styling (gray-50 bg, rounded-2xl, teal icon bg)
- Icons: Sparkles, Users, Zap from lucide-react (Zap replaces TrendingUp)

### Changes from Current
- All three descriptions replaced with unique copy
- Third icon changed from TrendingUp to Zap
- Section heading and subtitle added above the grid
- Mobile layout changed from 3-col to stacked

---

## Section 5: Bottom CTA

**File:** `src/components/landing/BottomCTA.tsx` (edit)

### Content
- **Headline:** "Ready to Get Started?"
- **Subheadline:** "Whether you're a restaurant looking for content or a creator looking for work — DragonCandy has you covered."
- **CTA 1 (teal, primary):** "I'm a Business — Get Started" → `/auth?mode=signup` (with arrow icon)
- **CTA 2 (outline, secondary):** "I'm a Creator — Join the Marketplace" → `/auth?mode=signup`

### Styling
- Anchor: `id="cta"`
- Keep existing card treatment: gradient bg, rounded-3xl, shadow, teal border glow on hover
- **Mobile:** Buttons stacked full-width
- **Desktop:** Buttons side-by-side, centered
- Arrow icon on primary button (ArrowRight from lucide-react, existing pattern)

### Changes from Current
- Headline, subheadline, and button text replaced
- Single CTA replaced with dual CTAs (business + creator)

---

## Section 6: PortfolioStrip

**File:** `src/components/landing/PortfolioStrip.tsx` (unchanged)

No modifications. Existing DragonFeed marquee carousel stays as-is.

---

## LandingPage.tsx Changes

**File:** `src/pages/LandingPage.tsx` (edit)

- Import new `HowItWorks` component
- Insert `<HowItWorks />` between `<HeroSection />` and `<FeatureSection />`
- No other structural changes

---

## Files Changed

| File | Action |
|------|--------|
| `src/components/landing/Header.tsx` | Edit — update nav links, add anchor scroll, update mobile drawer |
| `src/components/landing/HeroSection.tsx` | Edit — new headline, subheadline, dual CTAs |
| `src/components/landing/HowItWorks.tsx` | **New** — 3-step section |
| `src/components/landing/FeatureSection.tsx` | Edit — unique copy, section heading, mobile layout fix |
| `src/components/landing/FeatureCard.tsx` | No changes needed — mobile layout handled by FeatureSection grid |
| `src/components/landing/BottomCTA.tsx` | Edit — new headline, subheadline, dual CTAs |
| `src/pages/LandingPage.tsx` | Edit — import and render HowItWorks |

## Files NOT Changed

- `src/components/landing/PortfolioStrip.tsx`
- Login page, dashboard, or any other page
- Auth logic
- Supabase queries
- Tailwind config

---

## Verification

- `npm run build` succeeds with no errors
- Page renders correctly at 375px (mobile) and 1440px (desktop)
- All nav anchor links smooth-scroll to correct sections
- Both CTA buttons navigate to `/auth?mode=signup`
- Existing animations preserved
- Commit message: `landing: professional landing page with clear value proposition`
