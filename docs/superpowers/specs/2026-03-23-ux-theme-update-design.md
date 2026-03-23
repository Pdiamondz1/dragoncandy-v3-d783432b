# DragonCandy Mobile UX Theme Update — Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Approach:** Foundation-First (Phase 1 → Phase 2 → Phase 3)

---

## Overview

Full UX frontend design theme update for the DragonCandy mobile app. Updates every page to match the design screenshots in `/designs/`, applying a consistent theme system across all ~50 pages. Includes new logo, new font pairing, updated color system (light + dark mode), and page-specific layouts.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Scope | Option A — Extract theme from 8 screenshots, apply to ALL pages |
| Fonts | Outfit (all weights) + Pacifico (script accent) |
| Logo | New green dragon medallion (`designs/DragonCandy_logo.png`) |
| Dark mode | Update both light and dark mode |
| Bottom nav center button | Keep Donny AI chat |
| Campaign view | Full Tinder-style swipe card stack |
| Implementation | Foundation-First with parallel sub-agents for Phase 3 |

---

## Phase 1: Theme Foundation

### 1.1 Typography System

**Font stack (Google Fonts):**

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Heading | Outfit | 700–800 | ALL CAPS page titles, section headings, card titles |
| Body | Outfit | 400–500 | Body copy, descriptions, placeholder text |
| Button | Outfit | 600–700 | Button labels, CTAs |
| Script accent | Pacifico | 400 | "Quick Actions" style decorative headings |

**Typography scale (mobile):**

| Element | Size | Weight | Style |
|---------|------|--------|-------|
| H1 / Page title | 24–28px | 800 | uppercase, letter-spacing: 1–2px |
| H2 / Section heading | 20–22px | 700 | title case or uppercase |
| H3 / Card title | 16–18px | 700 | sentence case |
| Body text | 16px (min) | 400 | sentence case, line-height: 1.6 |
| Button label | 15–16px | 600–700 | sentence case |
| Caption / small | 12–13px | 400 | sentence case, gray |
| Stats / numbers | 24–32px | 800 | large bold display |
| Script accent | 22–28px | 400 (Pacifico) | decorative, teal or pink |

### 1.2 Color System

**Light Mode (from screenshots):**

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| Teal Primary | `#4DD9C0` | `dc-teal` | Primary buttons, borders, headings, icons |
| Teal Dark | `#00E5CC` | `dc-teal-dark` | Hover states |
| Pink Secondary | `#F9A8D4` | `dc-pink` | Inbound bubbles, CTA accents, creator cards |
| Pink Accent | `#EC4899` | `dc-pink-accent` | Secondary button text, links, star ratings |
| Pink BG | `#F9C8E0` | `dc-pink-bg` | Browse Creators bg, dashboard header |
| Gray BG | `#A8A8A0` | `dc-gray` | Messaging, campaigns, portfolio backgrounds |
| White BG | `#FFFFFF` | `white` | Landing page, cards, form backgrounds |
| Text Dark | `#111111` | — | Headings, bold labels, card titles |
| Text Gray | `#555555` | — | Body copy, subtitles, placeholder text |
| Text White | `#FFFFFF` | — | Text on dark/image backgrounds |
| Yellow CTA | `#FACC15` | `dc-yellow` | Accent indicator strips |

**Dark Mode (derived):**

| Token | Hex | Usage |
|-------|-----|-------|
| Teal Primary | `#3FC4AD` | Slightly muted for dark surfaces |
| Pink Secondary | `#E890BC` | Softer pink for dark mode |
| Pink Accent | `#DB3A88` | Deeper accent |
| Yellow CTA | `#E5B813` | Slightly warmer |
| Surface | `#2A2A3E` | Card/component backgrounds |
| Pink Surface | `#3A1A2E` | Pink-tinted surface for browse/dashboard |
| Background | `#16162A` | Main dark background |
| Text Primary | `#F0F0F0` | Primary text on dark |

### 1.3 Logo Update

- Copy `designs/DragonCandy_logo.png` → `src/assets/dragon-candy-logo.png` (overwrite existing)
- Generate new PWA icons (192x192, 512x512) from new logo → `public/icons/`
- Generate new `favicon.ico` from new logo → `public/`
- All existing code references use same path — no import changes needed

### 1.4 Shared Component Updates

| Component | Changes |
|-----------|---------|
| **Button** (`ui/button.tsx`) | Default `rounded-full` (pill shape), Outfit font, teal primary, pink secondary. Min height 48px on mobile. Full-width variant for CTAs. |
| **Card** (`ui/card.tsx`) | `rounded-2xl` / `rounded-3xl`, `border-2 border-dc-teal` on interactive cards, consistent `p-4` padding. |
| **Input** (`ui/input.tsx`) | `rounded-full` (pill shape), white fill, centered placeholder text on auth pages. Min height 48px touch target. |
| **MobileTopNav** | New logo image, hamburger right, role-based background (pink gradient for business/creator dashboard, white for landing). Outfit font. |
| **MobileBottomNav** | 7 icons (Home, Favorites, Video, **+ Donny center**, Campaigns, Promote, Profile). Teal center button with shadow. 44px min touch targets. Active states. |
| **DashboardLayout** | Role-based page backgrounds via prop or route config. Outfit font inheritance. Proper bottom nav clearance (`pb-24`). |
| **Avatar** (`ui/avatar.tsx`) | `rounded-full` with `ring-2 ring-dc-teal` border. Consistent sizing. |
| **Badge** | Rounded pill, Outfit font, teal/pink variants. |
| **Sheet / Dialog** | Rounded corners, Outfit font, theme-consistent backgrounds. |

### 1.5 Page Background Map

| Page Category | Background |
|---------------|------------|
| Landing / Marketing | White (`#FFFFFF`) |
| Login / Auth | Gray (`#A8A8A0`) |
| Business/Creator Dashboard | Pink gradient header (`#F9C8E0` → white) |
| Browse Creators | Pink full page (`#F9C8E0`) |
| Messaging (chat area) | Gray (`#A8A8A0`) |
| Campaigns / Portfolio / Profile | Gray (`#A8A8A0`) |
| Settings / Forms / Wizards | White (`#FFFFFF`) |
| 404 / Error | Gray with centered message |

### 1.6 Tailwind Config Updates

- Add Outfit + Pacifico to `fontFamily` config
- Update HSL CSS variables for light and dark mode
- Ensure `dc-*` color tokens match new values
- Update `borderRadius` defaults
- Add font-related utilities if needed

### 1.7 Global CSS Updates (`index.css`)

- Add Google Fonts import for Outfit + Pacifico
- Update CSS custom properties (HSL variables) for both light and dark
- Set `font-family: 'Outfit', sans-serif` as base
- Keep existing animations (fade-in-up, scale-in, shimmer, etc.)

### 1.8 Mobile Design Constraints (All Pages)

| Constraint | Value |
|------------|-------|
| Viewport width | 375–430px |
| Min touch target | 44×44px |
| Button min height | 48px |
| Page gutters | 16px (`px-4`) |
| Card padding | 16px (`p-4`) |
| Min body font | 16px (prevents iOS zoom) |
| Bottom nav clearance | 80px (`pb-24`) |
| Scroll behavior | Vertical with momentum, no horizontal overflow |
| Element spacing | `gap-3` / `gap-4` between elements |

---

## Phase 2: Screenshot-Matched Pages (8 pages)

Each page is pixel-matched to its design screenshot.

### 2.1 Landing Page (`LandingPage.tsx`)

**Screenshot:** `DragonCandy_mobile_landing_page.png`
**Background:** White

**Layout (top to bottom):**
1. Top nav: New logo (left) + hamburger menu (right)
2. Hero section: ALL CAPS teal headline ("UNLEASH YOUR CREATIVITY..."), body text in gray, two pill CTAs stacked (teal "Get Started" + white/pink "Learn More")
3. Feature cards: 3-column grid (AI-Powered Marketing, Creator Marketplace, Campaign Management) — light gray bg, rounded-2xl
4. Portfolio image strip: 4 images in a horizontal row, edge-to-edge

### 2.2 Login / Auth Page (`AuthPage.tsx`)

**Screenshot:** `DragonCandy_login_page.png`
**Background:** Gray (`#A8A8A0`)

**Layout (top to bottom):**
1. Top nav: New logo (left) + hamburger (right)
2. Vertically centered form area
3. "WELCOME TO DRAGON CANDY" — white, ALL CAPS, bold
4. Email input — white pill, centered placeholder
5. Password input — white pill, centered placeholder
6. Login button — white pill with teal text (outline style)
7. "DON'T HAVE AN ACCOUNT?" — white, uppercase, small
8. Sign Up button — teal pill, white bold text
9. Social auth icons row: Google, Apple, Facebook (white circles)
10. Portfolio image strip at bottom edge

### 2.3 Business Dashboard (`BusinessDashboard.tsx`)

**Screenshot:** `restaurant_dashboard_page.png`
**Background:** Pink gradient header → white body

**Layout (top to bottom):**
1. Pink gradient header: Logo (left) + "WELCOME BACK, [BUSINESS]" in teal + subtitle + hamburger (right)
2. "Ask Donny..." search bar — teal-bordered pill with search icon
3. DragonDash card — teal-bordered rounded card, centered content, "+" icon, title, description, teal "DragonDash" pill CTA
4. "Quick Actions" — Pacifico script font, teal color, centered
5. Subtitle text — small, gray, centered
6. 3-column quick action cards — teal-bordered, bold title, short description
7. Bottom nav (7 icons)

### 2.4 Browse Creators (`CreatorBrowse.tsx`)

**Screenshot:** `browse_creators_page.png`
**Background:** Pink (`#F9C8E0`) full page

**Layout (top to bottom):**
1. Top nav: Logo (left) + hamburger (right)
2. "BROWSE CREATORS" — ALL CAPS, bold, centered, dark text
3. Subtitle — small, gray, centered
4. Scrollable creator cards list:
   - Each card: white bg, `rounded-2xl`, horizontal layout
   - Thumbnail image (left, `rounded-xl`, ~60×60px)
   - Creator name (bold) + description (gray) + pink "View Portfolio" pill button
5. Bottom nav (7 icons)

### 2.5 Creator Portfolio (Modal)

**Screenshot:** `creator_portfolio_page.png`
**Background:** Dark/charcoal

**Layout:**
1. Full-screen modal/overlay
2. Top bar: Logo (left) + "CREATOR PORTFOLIO" ALL CAPS title (center) + close "✕" (right)
3. Large hero image — fills ~60% of viewport, `rounded-xl`
4. Image counter — centered, gray text (e.g., "10/200")
5. Thumbnail gallery row — 3 images across, `rounded-lg`, with artist name labels
6. Dark bottom section

### 2.6 Creator/Business Profile (`PublicCreatorProfile.tsx`, `PublicBusinessProfile.tsx`)

**Screenshot:** `creator-business_profile.png`
**Background:** Gray with hero image

**Layout (top to bottom):**
1. Full-bleed hero image (~40% viewport)
2. Logo overlay on hero (top-left)
3. White pill-shaped profile card — overlaid at bottom of hero, overlapping
   - Circular avatar with teal ring (left)
   - Name (bold), star rating (pink), location (gray) — right side
4. Stats row — 3 columns, bold large numbers, separated by pink vertical dividers
5. "Reviews" heading — bold, centered
6. Reviews carousel — 3-column horizontal scroll, quote text + business name attribution
7. Full-width teal "GET IN TOUCH" pill CTA at bottom

### 2.7 Messaging Page (`DirectConversationPage.tsx`)

**Screenshot:** `Messaging_page.png`
**Background:** Gray (`#A8A8A0`) chat area

**Layout:**
1. White header bar:
   - Pink back arrow (left)
   - Creator name in teal + "Recently Active" subtitle (center)
   - Pink circle with phone icon (right)
2. Gray chat area (flex-grow, scrollable):
   - Inbound bubbles: pink (`#F9A8D4`), left-aligned, with DragonCandy logo avatar
   - Outbound bubbles: teal (`#4DD9C0`), right-aligned, with user avatar
   - Bubble shape: `rounded-2xl` fully rounded ends
3. Teal top border on input area
4. Input bar (white bg):
   - Dark circle "+" button (left, 44px)
   - Pink-bordered pill text input (center, flex-grow)
   - Dark send arrow icon (right)

### 2.8 Available Campaigns — Swipe Card Stack (`CreatorCampaignMarketplace.tsx`)

**Screenshot:** `Creator_view_of_available_campaigns.png`
**Background:** Gray (`#A8A8A0`)

**Layout:**
1. Header: Logo (left) + "Available Campaigns" title + location pin with city + creator avatar (right) + hamburger
2. Card stack area (fills remaining space):
   - Peek cards visible behind main card (scaled down, offset, lower opacity)
   - Front card: white bg, `rounded-2xl`, shadow
     - Hero image (top ~65%, full-bleed within card)
     - "Available Campaigns" overlay text on image
     - Description text
     - Company avatar + company name row
     - Full-width pink "Apply Now" pill CTA
3. Bottom nav (7 icons)

**Swipe behavior:**
- Swipe right = interested/apply
- Swipe left = skip/next
- Cards animate off-screen with rotation
- Next card scales up from behind with spring physics
- Touch/drag gesture support
- **Tech:** `react-tinder-card` or custom gesture handler with `framer-motion`

---

## Phase 3: Remaining Pages (~40 pages)

### 3.1 Reusable Mobile Templates

All pages without screenshots follow one of 4 templates:

**Template A — Dashboard/Overview:**
- Pink gradient header with logo + welcome message
- White body with card grids, stats sections
- Bottom nav
- Used for: dashboards, analytics, earnings, promotional tools

**Template B — List/Browse:**
- White header with back arrow (pink) + centered title
- Scrollable list of teal-bordered cards
- Bottom nav
- Used for: projects, messages list, applications, sponsorships, reviews, feed

**Template C — Form/Settings:**
- White header with back arrow + centered title
- White background
- Pill-shaped inputs, section labels (uppercase, small), toggles
- Full-width teal "Save" CTA at bottom
- Bottom nav
- Used for: settings, profile setup, onboarding, wizards, auth forms

**Template D — Detail/Hero View:**
- Gray background
- Hero image area (top ~35–40%)
- White card overlay with rounded top corners, slides up over hero
- Stats row with pink dividers
- Content sections
- Full-width teal primary CTA at bottom
- Used for: campaign details, project details, public profiles

### 3.2 Sub-Agent Groups (6 parallel agents)

**Group 1 — Dashboards & Home (4 pages):**
| Page | Template |
|------|----------|
| CreatorDashboard | A |
| BrandDashboard | A |
| Index | Redirect only |
| ROIDashboard | A |

**Group 2 — Campaigns & Applications (8 pages):**
| Page | Template |
|------|----------|
| CampaignsPage | B |
| CampaignDetailsPage | D |
| BrandCampaignDetails | D |
| CampaignWizard | C |
| CampaignEditPage | C |
| AnonymousCampaignWizard | C |
| CreatorApplications | B |
| BrandDiscoverCampaigns | B |

**Group 3 — Messaging & Conversations (4 pages):**
| Page | Template |
|------|----------|
| DirectMessagesPage | B |
| DirectConversationPage | Phase 2 messaging design |
| CampaignMessagesPage | B |
| BrandMessages | B |

**Group 4 — Profiles & Onboarding (6 pages):**
| Page | Template |
|------|----------|
| CreatorProfileSetup | C |
| BusinessProfileSetup | C |
| BrandProfileSetup | C |
| ProfileOnboarding | C |
| PublicCreatorProfile | D |
| PublicBusinessProfile | D |

**Group 5 — Projects, Earnings & Activity (6 pages):**
| Page | Template |
|------|----------|
| CreatorProjects | B |
| BusinessProjects | B |
| ProjectDetailsPage | D |
| CreatorEarnings | A |
| BusinessActivity | B |
| BrandAnalytics | A |

**Group 6 — Settings, Promotions & Misc (12+ pages):**
| Page | Template |
|------|----------|
| CreatorSettings | C |
| BusinessSettings | C |
| BrandSettings | C |
| BusinessPromotionalTools | A |
| PromotionSubmissionPage | C |
| BusinessSponsorships / BrandSponsorships | B |
| BusinessProposals | B |
| ReviewsManagement | B |
| BrandCreators | B |
| CreatorDragonFeed / BusinessDragonFeed | B |
| VerifyEmail / ForgotPassword / UpdatePassword | C |
| NotFound (404) | Gray bg, centered message |

---

## Dependencies & New Packages

| Package | Purpose |
|---------|---------|
| `react-tinder-card` or `framer-motion` | Campaign swipe card stack gestures |

No other new dependencies required. Outfit + Pacifico loaded via Google Fonts CDN.

---

## Files Modified (Summary)

### Phase 1 (Foundation):
- `tailwind.config.ts` — font family, color tokens, border radius
- `src/index.css` — Google Fonts import, CSS variables (light + dark), base font
- `src/assets/dragon-candy-logo.png` — replaced with new logo
- `public/icons/icon-192.png`, `icon-512.png` — new PWA icons
- `public/favicon.ico` — new favicon
- `src/components/ui/button.tsx` — pill shape, sizing
- `src/components/ui/card.tsx` — rounded corners, borders
- `src/components/ui/input.tsx` — pill shape, sizing
- `src/components/ui/avatar.tsx` — teal ring
- `src/components/ui/badge.tsx` — theme updates
- `src/components/MobileTopNav.tsx` — logo, background, font
- `src/components/MobileBottomNav.tsx` — 7 icons, touch targets, active states
- `src/components/DashboardLayout.tsx` — backgrounds, spacing, font

### Phase 2 (8 screenshot pages):
- `src/pages/LandingPage.tsx` + sub-components
- `src/pages/AuthPage.tsx` + auth components
- `src/pages/BusinessDashboard.tsx` + dashboard components
- `src/pages/CreatorBrowse.tsx` + creator card components
- Creator Portfolio modal component
- `src/pages/PublicCreatorProfile.tsx` / `PublicBusinessProfile.tsx`
- `src/pages/DirectConversationPage.tsx` + message components
- `src/pages/CreatorCampaignMarketplace.tsx` + new swipe card component

### Phase 3 (remaining ~40 pages):
- All pages listed in sub-agent groups above
- Template patterns applied per assignment table

---

## Out of Scope

- Desktop/tablet responsive layouts (mobile-first only, existing desktop patterns maintained)
- New features or functionality changes
- Database schema changes
- API/backend changes
- Stripe integration changes
- Dark mode screenshot designs (we derive dark mode from light mode patterns)
