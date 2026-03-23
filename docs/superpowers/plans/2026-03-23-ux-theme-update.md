# DragonCandy Mobile UX Theme Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the entire DragonCandy mobile app UX to match design screenshots, applying a unified theme system (Outfit+Pacifico fonts, updated colors, new logo, pill-shaped components) across all ~50 pages.

**Architecture:** Foundation-First approach — Phase 1 builds the design system (Tailwind config, CSS variables, fonts, logo, shared components), Phase 2 pixel-matches 8 screenshot pages, Phase 3 applies the theme to remaining ~40 pages via 6 parallel sub-agent groups using 4 reusable mobile templates.

**Tech Stack:** React + TypeScript, Tailwind CSS, shadcn/ui, Google Fonts (Outfit + Pacifico), react-tinder-card (campaign swipe), Supabase (no backend changes)

**Spec:** `docs/superpowers/specs/2026-03-23-ux-theme-update-design.md`

**Design Screenshots:** `designs/` folder (8 PNG files + logo)

---

## Phase 1: Theme Foundation (Sequential)

Phase 1 tasks MUST complete before Phase 2 or 3 begin. They modify shared config/components that all pages depend on.

---

### Task 1: Google Fonts + index.html Setup

**Files:**
- Modify: `index.html:5` (viewport meta)
- Modify: `index.html:11` (add font link tags before `<title>`)

- [ ] **Step 1: Add Google Fonts link tags and update viewport for safe-area**

Add these lines to `index.html` `<head>`, before the `<title>` tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap" rel="stylesheet">
```

Update the viewport meta (line 5) to add `viewport-fit=cover`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Verify fonts load**

Run: `npm run dev`
Open browser dev tools → Network tab → filter by "fonts". Verify Outfit and Pacifico woff2 files load.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(theme): add Outfit + Pacifico Google Fonts and safe-area viewport"
```

---

### Task 2: Tailwind Config — Font Families

**Files:**
- Modify: `tailwind.config.ts:1` (add import)
- Modify: `tailwind.config.ts:20` (add fontFamily to extend block)

- [ ] **Step 1: Add fontFamily config**

At top of `tailwind.config.ts`, add the import:

```typescript
import defaultTheme from "tailwindcss/defaultTheme";
```

Inside `theme.extend` (after line 20, before `colors`), add:

```typescript
fontFamily: {
  sans: ['Outfit', ...defaultTheme.fontFamily.sans],
  script: ['Pacifico', 'cursive'],
},
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run dev`
Expected: No build errors. Text on all pages should now render in Outfit font.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(theme): add Outfit and Pacifico font families to Tailwind config"
```

---

### Task 3: CSS Variables — Light + Dark Mode Update

**Files:**
- Modify: `src/index.css:8-18` (html/body base styles)
- Modify: `src/index.css:40-83` (light mode :root)
- Modify: `src/index.css:86-128` (dark mode .dark)

- [ ] **Step 1: Add Outfit as base body font**

In `src/index.css`, update the `body` rule inside the first `@layer base` block (around line 16) to add `font-family`:

```css
body {
  height: 100%;
  overflow-x: hidden;
  position: relative;
  font-family: 'Outfit', sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
```

- [ ] **Step 2: Update dark mode CSS variables**

In the `.dark` block (lines 86-128), update these variables to match the spec's derived dark mode:

```css
.dark {
  --background: 240 27% 14%;
  --foreground: 0 0% 94%;

  --card: 240 24% 19%;
  --card-foreground: 0 0% 94%;

  --popover: 240 24% 19%;
  --popover-foreground: 0 0% 94%;

  --primary: 166 52% 51%;
  --primary-foreground: 240 27% 14%;

  --secondary: 330 65% 74%;
  --secondary-foreground: 240 27% 14%;

  --muted: 240 20% 22%;
  --muted-foreground: 215 20% 65%;

  --accent: 330 38% 16%;
  --accent-foreground: 330 65% 74%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 94%;

  --border: 240 20% 25%;
  --input: 240 20% 25%;
  --ring: 166 52% 51%;

  --sidebar-background: 240 27% 11%;
  --sidebar-foreground: 0 0% 90%;
  --sidebar-primary: 166 52% 51%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 240 20% 18%;
  --sidebar-accent-foreground: 0 0% 90%;
  --sidebar-border: 240 20% 20%;
  --sidebar-ring: 166 52% 51%;
}
```

- [ ] **Step 3: Verify light and dark modes visually**

Run: `npm run dev`
Toggle dark mode in browser. Verify colors look correct in both modes.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): update CSS variables for Outfit font and dark mode colors"
```

---

### Task 4: Logo Replacement

**Files:**
- Replace: `src/assets/dragon-candy-logo.png`
- Replace: `public/icons/icon-192.png`
- Replace: `public/icons/icon-512.png`
- Replace: `public/favicon.ico`

- [ ] **Step 1: Copy new logo over existing**

```bash
cp designs/DragonCandy_logo.png src/assets/dragon-candy-logo.png
```

- [ ] **Step 2: Generate PWA icons**

Option A — use `pwa-asset-generator` (recommended):
```bash
npx pwa-asset-generator designs/DragonCandy_logo.png public/icons --icon-only --favicon
```

Option B — use `sharp` CLI:
```bash
npx sharp -i designs/DragonCandy_logo.png -o public/icons/icon-192.png resize 192 192
npx sharp -i designs/DragonCandy_logo.png -o public/icons/icon-512.png resize 512 512
```

Option C — if neither works, copy the source PNG to both icon paths (it will be larger than needed but functional until proper icons are generated).

- [ ] **Step 3: Generate favicon**

Use an online PNG-to-ICO converter, or:

```bash
npx png-to-ico designs/DragonCandy_logo.png > public/favicon.ico
```

- [ ] **Step 4: Verify logo appears in dev**

Run: `npm run dev`
Check the logo renders on the landing page and in the browser tab.

- [ ] **Step 5: Commit**

```bash
git add src/assets/dragon-candy-logo.png public/icons/ public/favicon.ico
git commit -m "feat(theme): replace logo with new DragonCandy green dragon medallion"
```

---

### Task 5: Button Component Update

**Files:**
- Modify: `src/components/ui/button.tsx:8` (base classes)
- Modify: `src/components/ui/button.tsx:23-26` (size variants)

- [ ] **Step 1: Update button base and variants**

In `src/components/ui/button.tsx`, update the `buttonVariants` cva call:

Change the base classes (line 8) from:
```
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
```

To:
```
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-base font-semibold ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
```

Key changes: `rounded-md` → `rounded-full`, `text-sm` → `text-base`, `font-medium` → `font-semibold`, added `duration-200`.

Update size variants:
```typescript
size: {
  default: "h-12 px-6 py-2",
  sm: "h-10 rounded-full px-4",
  lg: "h-14 rounded-full px-8",
  icon: "h-12 w-12",
},
```

Key changes: `h-10` → `h-12` (48px for mobile touch), `h-9` → `h-10`, `h-11` → `h-14`, `rounded-md` → `rounded-full` on sm/lg, icon `h-10 w-10` → `h-12 w-12`.

- [ ] **Step 2: Verify buttons render correctly**

Run: `npm run dev`
Navigate to landing page or any page with buttons. Verify pill shapes, correct sizing.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(theme): update Button to pill shape with 48px mobile touch targets"
```

---

### Task 6: Card Component Update

**Files:**
- Modify: `src/components/ui/card.tsx:13` (Card base classes)
- Modify: `src/components/ui/card.tsx:25` (CardHeader padding)
- Modify: `src/components/ui/card.tsx:60` (CardContent padding)
- Modify: `src/components/ui/card.tsx:70` (CardFooter padding)

- [ ] **Step 1: Update Card component classes**

In `src/components/ui/card.tsx`:

Update Card base (line 13):
```
"rounded-lg border bg-card text-card-foreground shadow-sm"
```
→
```
"rounded-2xl border bg-card text-card-foreground shadow-sm"
```

Update CardHeader (line 25):
```
"flex flex-col space-y-1.5 p-6"
```
→
```
"flex flex-col space-y-1.5 p-4"
```

Update CardContent (line 60):
```
"p-6 pt-0"
```
→
```
"p-4 pt-0"
```

Update CardFooter (line 70):
```
"flex items-center p-6 pt-0"
```
→
```
"flex items-center p-4 pt-0"
```

- [ ] **Step 2: Verify cards look correct**

Run: `npm run dev`
Check dashboard cards, campaign cards. Should have more rounded corners and consistent padding.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(theme): update Card to rounded-2xl with mobile-friendly p-4 padding"
```

---

### Task 7: Input Component Update

**Files:**
- Modify: `src/components/ui/input.tsx:11` (input classes)

- [ ] **Step 1: Update Input to pill shape**

In `src/components/ui/input.tsx`, change the className (line 11):

```
"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
```
→
```
"flex h-12 w-full rounded-full border border-input bg-background px-5 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
```

Key changes: `h-10` → `h-12` (48px touch target), `rounded-md` → `rounded-full`, `px-3` → `px-5`, removed `md:text-sm` (keep 16px on all screens to prevent iOS zoom).

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat(theme): update Input to pill shape with 48px height"
```

---

### Task 8: Avatar Component Update

**Files:**
- Modify: `src/components/ui/avatar.tsx:13` (Avatar base classes)

- [ ] **Step 1: Add teal ring to Avatar**

In `src/components/ui/avatar.tsx`, update Avatar className (line 13):

```
"relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full"
```
→
```
"relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-dc-teal/60"
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/avatar.tsx
git commit -m "feat(theme): add teal ring to Avatar component"
```

---

### Task 9: Badge, Sheet, and Dialog Component Updates

**Files:**
- Modify: `src/components/ui/badge.tsx:7` (badge base classes)
- Modify: Sheet and Dialog components (if they have hardcoded `rounded-md` or non-Outfit fonts)

- [ ] **Step 1: Verify Badge component**

Read `src/components/ui/badge.tsx`. The badge already uses `rounded-full` — verify this is correct. If the base classes need updating, ensure they use:
- `rounded-full` (pill shape)
- `text-xs font-semibold` (already present)
- Primary variant: teal bg
- Secondary variant: pink bg

The current Badge component already uses `rounded-full`, so this may only need verification, not changes.

- [ ] **Step 2: Check Sheet and Dialog components**

Read `src/components/ui/sheet.tsx` and `src/components/ui/dialog.tsx`. These are shadcn/ui primitives that inherit from Radix UI. Ensure:
- Sheet content uses `rounded-t-2xl` on mobile (for bottom sheets)
- Dialog content uses `rounded-2xl`
- Both inherit Outfit font from the body (no explicit font overrides needed)

If these already have reasonable defaults, no changes needed — just verify.

- [ ] **Step 3: Commit if changes were made**

```bash
git add src/components/ui/badge.tsx src/components/ui/sheet.tsx src/components/ui/dialog.tsx
git commit -m "feat(theme): verify and update Badge, Sheet, Dialog components"
```

---

### Task 10: MobileTopNav Theme Update

**Files:**
- Modify: `src/components/MobileTopNav.tsx` (full restyle)

- [ ] **Step 1: Update MobileTopNav styling**

Read the current file fully, then update the component to:

1. Use the new logo image: `import logo from '@/assets/dragon-candy-logo.png'` — use `<img>` tag instead of any text logo, sized to `h-12 w-12`
2. Background: use `bgClass` prop, default to `bg-white`
3. Welcome text: `font-semibold text-sm uppercase tracking-wide text-dc-teal`
4. Hamburger icon: `h-6 w-6 text-gray-600`
5. Sheet menu items: `text-base font-medium` with proper touch targets (`py-3`)
6. Overall: `sticky top-0 z-50 px-4 py-2`

Preserve existing functionality (role-based links, logout, Sheet menu). Only change styling.

- [ ] **Step 2: Verify on multiple page types**

Run: `npm run dev`
Check landing page (white bg), dashboard (pink bg), messaging (gray). Logo should render correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileTopNav.tsx
git commit -m "feat(theme): restyle MobileTopNav with new logo, Outfit font, role-based backgrounds"
```

---

### Task 11: MobileBottomNav Theme Update

**Files:**
- Modify: `src/components/MobileBottomNav.tsx` (restyle)

- [ ] **Step 1: Update MobileBottomNav styling**

Read the current file fully, then update:

1. Container: `fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100` with safe-area padding: `pb-[env(safe-area-inset-bottom)]`
2. Nav items: `min-h-[44px] min-w-[44px]` touch targets
3. Center Donny button: `bg-dc-teal w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center`
4. Inactive icons: `text-[#888888]`
5. Active icons: `text-dc-teal font-bold`
6. Active labels: `text-[10px] font-semibold text-dc-teal`
7. Preserve `DonnyNavButton` integration and `DonnyChatSheet` overlay

- [ ] **Step 2: Verify bottom nav on dashboard**

Run: `npm run dev`
Check: 7 icons visible, center Donny button prominent teal, correct active states.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "feat(theme): restyle MobileBottomNav with 44px touch targets, teal center Donny button"
```

---

### Task 12: DashboardLayout Theme Update

**Files:**
- Modify: `src/components/DashboardLayout.tsx` (background, spacing)

- [ ] **Step 1: Update DashboardLayout**

Read the current file fully, then update:

1. Ensure `pb-24` (80px) clearance at bottom of main content for bottom nav
2. Desktop sidebar: preserve existing behavior but ensure Outfit font inheritance
3. Mobile: ensure `MobileTopNav` gets correct `bgClass` based on `userRole`:
   - `business_client` / `content_creator` → `"bg-gradient-to-b from-dc-pink-bg to-pink-50"`
   - Default → `"bg-white"`
4. Main content area: `min-h-screen overflow-x-hidden`

Preserve all existing functionality (auth, sidebar, AI chat, notifications).

- [ ] **Step 2: Verify dashboard pages**

Navigate to Business Dashboard, Creator Dashboard. Verify pink gradient header, proper bottom padding.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat(theme): update DashboardLayout with role-based backgrounds and bottom nav clearance"
```

---

### Task 13: Install react-tinder-card

**Files:**
- Modify: `package.json` (new dependency)

- [ ] **Step 1: Install the package**

```bash
npm install react-tinder-card
```

- [ ] **Step 2: Verify install**

```bash
npm ls react-tinder-card
```

Expected: `react-tinder-card@x.x.x`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add react-tinder-card for campaign swipe card stack"
```

---

## Phase 2: Screenshot-Matched Pages

Phase 2 tasks can be partially parallelized. Tasks 14–16 (Landing, Auth, Dashboard) have no dependencies on each other. Tasks 17–21 also have no dependencies on each other. All depend on Phase 1 completing first.

**Parallelization groups:**
- **P2-A (parallel):** Task 14 (Landing), Task 15 (Auth), Task 16 (Dashboard)
- **P2-B (parallel):** Task 17 (Browse Creators), Task 18 (Portfolio Modal), Task 19 (Profile), Task 20 (Messaging), Task 21 (Campaigns Swipe)

---

### Task 14: Landing Page Restyle

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: Landing sub-components (Header, HeroSection, FeatureSection, BottomCTA)

**Reference:** `designs/DragonCandy_mobile_landing_page.png`

- [ ] **Step 1: Read all landing page components**

Read `src/pages/LandingPage.tsx` and identify all imported sub-components. Read each one to understand current structure.

- [ ] **Step 2: Update Header component**

Match screenshot: Logo (left, `h-12 w-12`) + hamburger icon (right). White background. No other nav links on mobile.

- [ ] **Step 3: Update HeroSection**

Match screenshot:
- ALL CAPS teal headline: `text-2xl font-extrabold uppercase tracking-wide text-dc-teal text-center`
- Body text: `text-base text-gray-500 text-center mt-4`
- Two stacked pill CTAs: teal "Get Started" (`bg-dc-teal text-white w-full rounded-full h-12 font-bold`) + white "Learn More" (`bg-white text-dc-pink-accent border border-gray-200 w-full rounded-full h-12 font-semibold`)

- [ ] **Step 4: Update FeatureSection**

Match screenshot: 3-column grid of feature cards. Each card: `bg-gray-50 rounded-2xl p-4 text-center`. Bold title (`text-sm font-bold`) + description (`text-xs text-gray-500`).

- [ ] **Step 5: Add portfolio image strip at bottom**

If not already present, add a horizontal row of 4 portfolio images edge-to-edge at the bottom. Use `CreatorPortfolioFeed` or create a simple image strip.

- [ ] **Step 6: Verify against screenshot**

Compare with `designs/DragonCandy_mobile_landing_page.png` in mobile viewport (375px).

- [ ] **Step 7: Commit**

```bash
git add src/pages/LandingPage.tsx src/components/landing/
git commit -m "feat(theme): restyle Landing page to match design screenshot"
```

---

### Task 15: Auth Page Restyle

**Files:**
- Modify: `src/pages/AuthPage.tsx`
- Modify: Auth sub-components (AuthHeader, AuthForm, etc.)

**Reference:** `designs/DragonCandy_login_page.png`

- [ ] **Step 1: Read auth page and components**

Read `src/pages/AuthPage.tsx` and all auth sub-components to understand current structure.

- [ ] **Step 2: Update page background and layout**

Page: `min-h-screen bg-dc-gray flex flex-col`
Top nav: Logo (left) + hamburger (right) on gray bg
Form area: `flex-1 flex flex-col justify-center px-6`

- [ ] **Step 3: Update form styling**

Match screenshot:
- "WELCOME TO DRAGON CANDY" — `text-xl font-bold uppercase tracking-wider text-white text-center`
- Inputs: white pill (`bg-white rounded-full text-center h-12`), placeholder centered
- Login button: `bg-white text-dc-teal border border-gray-200 rounded-full h-12 font-semibold shadow-sm w-full`
- "DON'T HAVE AN ACCOUNT?" — `text-xs text-white uppercase tracking-widest text-center`
- Sign Up: `bg-dc-teal text-white rounded-full h-12 font-bold w-full`

- [ ] **Step 4: Add social auth icons**

Row of 3 circular buttons below Sign Up: Google, Apple, Facebook. Each: `w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm`

- [ ] **Step 5: Add portfolio strip at bottom**

Edge-to-edge image strip at bottom of page, same as landing page.

- [ ] **Step 6: Verify against screenshot**

Compare with `designs/DragonCandy_login_page.png`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AuthPage.tsx src/components/auth/
git commit -m "feat(theme): restyle Auth page to match design screenshot"
```

---

### Task 16: Business Dashboard Restyle

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`
- Modify: Dashboard sub-components (DonnyCard, AskBar, quick action cards)

**Reference:** `designs/restaurant_dashboard_page.png`

- [ ] **Step 1: Read dashboard page and components**

Read `src/pages/BusinessDashboard.tsx` and all imported sub-components.

- [ ] **Step 2: Update header section**

Pink gradient header is handled by DashboardLayout (Task 12). Verify logo + "WELCOME BACK, [BUSINESS]" renders correctly.

- [ ] **Step 3: Update Ask Donny search bar**

Match screenshot: `border-2 border-dc-teal rounded-full px-4 py-3 flex items-center gap-2`. Search icon (gray) + "Ask Donny..." placeholder text (`text-gray-400`).

- [ ] **Step 4: Update DragonDash card**

Match screenshot: `border-2 border-dc-teal rounded-2xl p-6 text-center`. Teal "+" circle at top, "Start A DragonDash" bold title, description, teal pill CTA.

- [ ] **Step 5: Update Quick Actions section**

"Quick Actions" in Pacifico script: `font-script text-2xl text-dc-teal text-center`
Subtitle: `text-sm text-gray-500 text-center`
3-column grid: each card `border-2 border-dc-teal rounded-2xl p-3 text-center`, bold title (`text-sm font-bold`) + description (`text-xs text-gray-500`).

- [ ] **Step 6: Verify against screenshot**

Compare with `designs/restaurant_dashboard_page.png`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/BusinessDashboard.tsx src/components/
git commit -m "feat(theme): restyle Business Dashboard to match design screenshot"
```

---

### Task 17: Browse Creators Restyle

**Files:**
- Modify: `src/pages/CreatorBrowse.tsx`
- Modify: Creator browse sub-components (CreatorBrowseHeader, CreatorBrowseContent)

**Reference:** `designs/browse_creators_page.png`

- [ ] **Step 1: Read creator browse components**

Read `src/pages/CreatorBrowse.tsx` and sub-components.

- [ ] **Step 2: Update page background**

Full pink background: `bg-dc-pink-bg min-h-screen`

- [ ] **Step 3: Update header**

"BROWSE CREATORS" — `text-2xl font-extrabold uppercase tracking-wide text-gray-900 text-center`
Subtitle — `text-sm text-gray-500 text-center mt-1`

- [ ] **Step 4: Update creator cards**

Each card: `bg-white rounded-2xl p-3 flex items-center gap-3`
- Thumbnail: `w-16 h-16 rounded-xl object-cover`
- Name: `text-base font-bold text-gray-900`
- Description: `text-xs text-gray-500`
- Button: `bg-dc-pink text-white rounded-full px-4 py-1.5 text-xs font-semibold`

- [ ] **Step 5: Verify against screenshot**

Compare with `designs/browse_creators_page.png`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreatorBrowse.tsx src/components/creator-search/
git commit -m "feat(theme): restyle Browse Creators to match design screenshot"
```

---

### Task 18: Creator Portfolio Modal (New Component)

**Files:**
- Create: `src/components/creator-profile/CreatorPortfolioModal.tsx`

**Reference:** `designs/creator_portfolio_page.png`

- [ ] **Step 1: Create CreatorPortfolioModal component**

New component with props: `isOpen`, `onClose`, `creatorName`, `images` (array of `{url, artistName}`), `currentIndex`, `onIndexChange`.

Layout:
- Full-screen overlay: `fixed inset-0 z-50 bg-gray-900`
- Top bar: Logo (left) + "CREATOR PORTFOLIO" ALL CAPS (center, white) + close "✕" button (right)
- Hero image: `flex-1 mx-4 rounded-xl overflow-hidden object-cover`
- Counter: `text-center text-gray-400 text-sm py-2` (e.g., "10/200")
- Thumbnail gallery: `flex gap-2 px-4 pb-4`, each thumbnail `flex-1 h-20 rounded-lg overflow-hidden relative`, artist name overlay `absolute bottom-1 left-2 text-white text-xs`

- [ ] **Step 2: Wire into Browse Creators page**

Import `CreatorPortfolioModal` in the Browse Creators page or creator card component. Open modal when "View Portfolio" is clicked.

- [ ] **Step 3: Verify against screenshot**

Compare with `designs/creator_portfolio_page.png`.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-profile/CreatorPortfolioModal.tsx
git commit -m "feat(theme): add CreatorPortfolioModal matching design screenshot"
```

---

### Task 19: Public Profile Pages Restyle

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`
- Modify: `src/pages/PublicBusinessProfile.tsx`

**Reference:** `designs/creator-business_profile.png`

- [ ] **Step 1: Read both profile pages**

Read current structure of both pages.

- [ ] **Step 2: Update layout to match screenshot**

Both pages follow same layout:
- Page bg: `bg-dc-gray min-h-screen`
- Full-bleed hero image: `h-[40vh] w-full object-cover`
- Logo overlay on hero: `absolute top-4 left-4` with logo image
- White profile card: `bg-white rounded-3xl -mt-6 relative z-10 mx-4 px-4 py-3 flex items-center gap-3 shadow-md`
  - Avatar: `w-16 h-16 rounded-full ring-2 ring-dc-teal`
  - Name: `text-lg font-bold`
  - Rating: `text-sm text-dc-pink-accent` with star icon
  - Location: `text-xs text-gray-500 uppercase`
- Stats row: `flex justify-around py-4`, each stat has `text-3xl font-extrabold` number + `text-xs text-gray-500` label, separated by `border-r border-dc-pink`
- Reviews: `text-lg font-bold text-center mb-3` heading, horizontal scroll of review cards
- CTA: `w-full bg-dc-teal text-white rounded-full h-14 font-bold uppercase tracking-wide`

- [ ] **Step 3: Verify against screenshot**

Compare with `designs/creator-business_profile.png`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx src/pages/PublicBusinessProfile.tsx
git commit -m "feat(theme): restyle public profile pages to match design screenshot"
```

---

### Task 20: Messaging Page Restyle

**Files:**
- Modify: `src/pages/DirectConversationPage.tsx`
- Modify: Related message components (bubbles, input bar)

**Reference:** `designs/Messaging_page.png`

- [ ] **Step 1: Read messaging page and components**

Read `src/pages/DirectConversationPage.tsx` and all message-related sub-components.

- [ ] **Step 2: Update chat header**

Match screenshot:
- White bg, `px-4 py-3 flex items-center justify-between`
- Back arrow: `text-dc-pink text-xl` (left)
- Center: Creator name `text-lg font-bold text-dc-teal` + "Recently Active" `text-xs text-gray-500`
- Right: Pink circle phone icon `w-10 h-10 rounded-full bg-dc-pink-bg flex items-center justify-center`

- [ ] **Step 3: Update chat bubbles**

- Chat area: `bg-dc-gray flex-1 overflow-y-auto px-4 py-4`
- Inbound: `bg-dc-pink rounded-2xl px-4 py-2.5 max-w-[75%]` + DragonCandy logo avatar (left)
- Outbound: `bg-dc-teal rounded-2xl px-4 py-2.5 max-w-[75%]` + user avatar (right)
- Bubble text: `text-white text-base`

- [ ] **Step 4: Update input bar**

Match screenshot:
- `bg-white border-t-2 border-dc-teal px-3 py-2 flex items-center gap-2`
- "+" button: `w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center`
- Input: `flex-1 border border-dc-pink rounded-full px-4 py-2 text-base`
- Send: `text-gray-900 text-xl`

- [ ] **Step 5: Verify against screenshot**

Compare with `designs/Messaging_page.png`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DirectConversationPage.tsx src/components/messages/
git commit -m "feat(theme): restyle Messaging page to match design screenshot"
```

---

### Task 21: Campaign Swipe Card Stack

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`
- Create: `src/components/campaigns/CampaignSwipeCard.tsx`

**Reference:** `designs/Creator_view_of_available_campaigns.png`

- [ ] **Step 1: Create CampaignSwipeCard component**

New component using `react-tinder-card`:

```typescript
import TinderCard from 'react-tinder-card';
```

Props: `campaigns` (array), `onSwipe(direction, campaign)`, `onApply(campaign)`.

Card layout:
- Container: `touch-none relative h-[60vh]`
- Stacked cards with absolute positioning, scale/opacity for depth
- Front card: `bg-white rounded-2xl shadow-xl overflow-hidden`
  - Hero image: `h-[65%] w-full object-cover`
  - Overlay text on image: `absolute bottom-0 p-4 text-white font-bold text-xl`
  - Content: `px-4 py-3`
    - Description: `text-sm text-gray-500`
    - Company row: avatar circle + company name
    - CTA: `w-full bg-dc-pink text-white rounded-full h-12 font-bold mt-3`

TinderCard config:
- `onSwipe={(dir) => onSwipe(dir, campaign)}`
- `preventSwipe={['up', 'down']}` (only left/right)
- `swipeRequirementType="position"`, `swipeThreshold={100}`

- [ ] **Step 2: Update CreatorCampaignMarketplace page**

Read current page. Replace the list/grid view with:
- Page bg: `bg-dc-gray min-h-screen`
- Header: Logo (left) + "Available Campaigns" title + location pin + creator avatar (right)
- `CampaignSwipeCard` component fills remaining space
- Bottom nav (via DashboardLayout)

- [ ] **Step 3: Verify swipe behavior**

Test in mobile viewport (375px):
- Swipe right → triggers apply/interested callback
- Swipe left → skips to next card
- Cards animate with rotation
- Peek cards visible behind

- [ ] **Step 4: Verify against screenshot**

Compare with `designs/Creator_view_of_available_campaigns.png`.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignSwipeCard.tsx src/pages/CreatorCampaignMarketplace.tsx
git commit -m "feat(theme): add campaign swipe card stack matching design screenshot"
```

---

## Phase 3: Remaining Pages (6 Parallel Sub-Agent Groups)

Phase 3 tasks run as **6 parallel sub-agents** after Phase 1 and Phase 2 complete. Each sub-agent receives the template definitions and page assignments.

**IMPORTANT:** Each sub-agent should read the spec's template definitions (Section 3.1) and the Phase 1 foundation before starting. Use the exact Tailwind classes specified in the templates.

**Common instructions for ALL Phase 3 sub-agents:**
1. Read the target page file(s) fully before modifying
2. Apply the assigned template pattern (A/B/C/D) from the spec
3. Preserve all existing functionality — only change styling/layout
4. Ensure `min-h-screen`, `overflow-x-hidden`, proper `pb-24` for bottom nav
5. Use Outfit font classes (`font-sans` or explicit) throughout
6. Test that the page renders without errors after changes
7. Commit after each page is complete

---

### Task 22: Phase 3 Group 1 — Dashboards & Home (Sub-Agent)

**Template:** A (Dashboard/Overview)
**Pages:**
- `src/pages/CreatorDashboard.tsx` → Template A
- `src/pages/BrandDashboard.tsx` → Template A
- `src/pages/ROIDashboard.tsx` → Template A
- `src/pages/Index.tsx` → Redirect only (verify no styling changes needed)

**NOTE:** `BusinessDashboard.tsx` is handled in Phase 2 Task 16. Do NOT touch it. `BrandDashboard.tsx` is a separate file.

**Template A — Dashboard/Overview (full classes):**
- Pink gradient header: `bg-gradient-to-b from-dc-pink-bg to-pink-50`
- Header text: `font-sans text-sm font-bold uppercase tracking-wide text-dc-teal`
- White body: `bg-white`
- Cards: `border-2 border-dc-teal rounded-2xl p-4`
- Stats: `text-3xl font-extrabold` with `text-xs text-gray-500` labels
- Bottom nav with `pb-24` clearance

- [ ] **Step 1-4: Apply Template A to each dashboard page, commit after each**

---

### Task 23: Phase 3 Group 2 — Campaigns & Applications (Sub-Agent)

**Templates:** B (List) + C (Form) + D (Detail)
**Pages:**
- `src/pages/CampaignsPage.tsx` → Template B
- `src/pages/CampaignDetailsPage.tsx` → Template D
- `src/pages/BrandCampaignDetails.tsx` → Template D
- `src/pages/CampaignWizard.tsx` → Template C
- `src/pages/CampaignEditPage.tsx` → Template C
- `src/pages/AnonymousCampaignWizard.tsx` → Template C
- `src/pages/CreatorApplications.tsx` → Template B
- `src/pages/BrandDiscoverCampaigns.tsx` → Template B

**NOTE:** `CreatorCampaignMarketplace.tsx` is handled in Phase 2 Task 21. Do NOT touch it.

**Template B — List/Browse (full classes):**
- White header: `bg-white border-b border-gray-100 px-4 py-3 flex items-center`
- Back arrow: `text-dc-pink-accent text-lg` (left)
- Title: `font-sans text-base font-bold text-gray-900 uppercase tracking-wide` (centered, flex-1)
- Scrollable list of teal-bordered cards: `border-2 border-dc-teal rounded-2xl p-4`
- Bottom nav with `pb-24` clearance

**Template C — Form/Settings (full classes):**
- White header: same as Template B
- White background: `bg-white`
- Section labels: `font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2`
- Pill-shaped inputs: `rounded-full h-12 px-5 text-base`
- Toggles with teal active state
- Full-width teal "Save" CTA: `w-full rounded-full bg-dc-teal text-white font-bold py-3`
- Bottom nav with `pb-24` clearance

**Template D — Detail/Hero View (full classes):**
- Gray background: `bg-dc-gray`
- Hero image area (top ~35–40%)
- Header overlay: `absolute top-0 left-0 right-0 px-4 py-3 flex items-center` with white text
- White card overlay: `bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6`
- Stats row with pink dividers: `border-r border-dc-pink`
- Full-width teal primary CTA at bottom: `w-full rounded-full bg-dc-teal text-white font-bold py-3`

- [ ] **Step 1-8: Apply assigned template to each page, commit after each**

---

### Task 24: Phase 3 Group 3 — Messaging & Conversations (Sub-Agent)

**Template:** B (List)
**Pages:**
- `src/pages/DirectMessagesPage.tsx` → Template B
- `src/pages/CampaignMessagesPage.tsx` → Template B
- `src/pages/BrandMessages.tsx` → Template B

**NOTE:** `DirectConversationPage.tsx` is handled in Phase 2 Task 20. Do NOT touch it.

**Template B — List/Browse (full classes):**
- White header: `bg-white border-b border-gray-100 px-4 py-3 flex items-center`
- Back arrow: `text-dc-pink-accent text-lg` (left)
- Title: `font-sans text-base font-bold text-gray-900 uppercase tracking-wide` (centered, flex-1)
- Scrollable list of teal-bordered cards: `border-2 border-dc-teal rounded-2xl p-4`
- Bottom nav with `pb-24` clearance

- [ ] **Step 1-3: Apply Template B to each messages list page, commit after each**

---

### Task 25: Phase 3 Group 4 — Profiles & Onboarding (Sub-Agent)

**Template:** C (Form)
**Pages:**
- `src/pages/CreatorProfileSetup.tsx` → Template C
- `src/pages/BusinessProfileSetup.tsx` → Template C
- `src/pages/BrandProfileSetup.tsx` → Template C
- `src/pages/ProfileOnboarding.tsx` → Template C

**NOTE:** `PublicCreatorProfile.tsx` and `PublicBusinessProfile.tsx` are handled in Phase 2 Task 19. Do NOT touch them.

**Template C — Form/Settings (full classes):**
- White header: `bg-white border-b border-gray-100 px-4 py-3 flex items-center`
- Back arrow: `text-dc-pink-accent text-lg` (left)
- Title: `font-sans text-base font-bold text-gray-900 uppercase tracking-wide` (centered, flex-1)
- White background: `bg-white`
- Section labels: `font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2`
- Pill-shaped inputs: `rounded-full h-12 px-5 text-base`
- Toggles with teal active state
- Full-width teal "Save" CTA: `w-full rounded-full bg-dc-teal text-white font-bold py-3`
- Bottom nav with `pb-24` clearance

- [ ] **Step 1-4: Apply Template C to each setup/onboarding page, commit after each**

---

### Task 26: Phase 3 Group 5 — Projects, Earnings & Activity (Sub-Agent)

**Templates:** A (Dashboard) + B (List) + D (Detail)
**Pages:**
- `src/pages/CreatorProjects.tsx` → Template B
- `src/pages/BusinessProjects.tsx` → Template B
- `src/pages/ProjectDetailsPage.tsx` → Template D
- `src/pages/CreatorEarnings.tsx` → Template A
- `src/pages/BusinessActivity.tsx` → Template B
- `src/pages/BrandAnalytics.tsx` → Template A

**Template A — Dashboard/Overview (full classes):**
- Pink gradient header: `bg-gradient-to-b from-dc-pink-bg to-pink-50`
- Header text: `font-sans text-sm font-bold uppercase tracking-wide text-dc-teal`
- White body: `bg-white`
- Cards: `border-2 border-dc-teal rounded-2xl p-4`
- Stats: `text-3xl font-extrabold` with `text-xs text-gray-500` labels
- Bottom nav with `pb-24` clearance

**Template B — List/Browse (full classes):**
- White header: `bg-white border-b border-gray-100 px-4 py-3 flex items-center`
- Back arrow: `text-dc-pink-accent text-lg` (left)
- Title: `font-sans text-base font-bold text-gray-900 uppercase tracking-wide` (centered, flex-1)
- Scrollable list of teal-bordered cards: `border-2 border-dc-teal rounded-2xl p-4`
- Bottom nav with `pb-24` clearance

**Template D — Detail/Hero View (full classes):**
- Gray background: `bg-dc-gray`
- Hero image area (top ~35–40%)
- Header overlay: `absolute top-0 left-0 right-0 px-4 py-3 flex items-center` with white text
- White card overlay: `bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6`
- Stats row with pink dividers: `border-r border-dc-pink`
- Full-width teal primary CTA at bottom: `w-full rounded-full bg-dc-teal text-white font-bold py-3`

- [ ] **Step 1-6: Apply assigned template to each page, commit after each**

---

### Task 27: Phase 3 Group 6 — Settings, Promotions & Misc (Sub-Agent)

**Templates:** A + B + C
**Pages:**
- `src/pages/CreatorSettings.tsx` → Template C
- `src/pages/BusinessSettings.tsx` → Template C
- `src/pages/BrandSettings.tsx` → Template C
- `src/pages/BusinessPromotionalTools.tsx` → Template A
- `src/pages/PromotionSubmissionPage.tsx` → Template C
- `src/pages/BusinessSponsorships.tsx` → Template B
- `src/pages/BrandSponsorships.tsx` → Template B
- `src/pages/BusinessProposals.tsx` → Template B
- `src/pages/ReviewsManagement.tsx` → Template B
- `src/pages/BrandCreators.tsx` → Template B
- `src/pages/CreatorDragonFeed.tsx` → Template B
- `src/pages/BusinessDragonFeed.tsx` → Template B
- `src/pages/VerifyEmail.tsx` → Template C
- `src/pages/ForgotPassword.tsx` → Template C
- `src/pages/UpdatePassword.tsx` → Template C
- `src/pages/NotFound.tsx` → `bg-dc-gray min-h-screen flex items-center justify-center`, centered message

**Template A — Dashboard/Overview (full classes):**
- Pink gradient header: `bg-gradient-to-b from-dc-pink-bg to-pink-50`
- Header text: `font-sans text-sm font-bold uppercase tracking-wide text-dc-teal`
- White body: `bg-white`
- Cards: `border-2 border-dc-teal rounded-2xl p-4`
- Stats: `text-3xl font-extrabold` with `text-xs text-gray-500` labels
- Bottom nav with `pb-24` clearance

**Template B — List/Browse (full classes):**
- White header: `bg-white border-b border-gray-100 px-4 py-3 flex items-center`
- Back arrow: `text-dc-pink-accent text-lg` (left)
- Title: `font-sans text-base font-bold text-gray-900 uppercase tracking-wide` (centered, flex-1)
- Scrollable list of teal-bordered cards: `border-2 border-dc-teal rounded-2xl p-4`
- Bottom nav with `pb-24` clearance

**Template C — Form/Settings (full classes):**
- White header: same as Template B
- White background: `bg-white`
- Section labels: `font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2`
- Pill-shaped inputs: `rounded-full h-12 px-5 text-base`
- Toggles with teal active state
- Full-width teal "Save" CTA: `w-full rounded-full bg-dc-teal text-white font-bold py-3`
- Bottom nav with `pb-24` clearance

- [ ] **Step 1-16: Apply assigned template to each page, commit after each**

---

## Final Verification

### Task 28: Full App Smoke Test

- [ ] **Step 1: Run dev server and test all 8 screenshot pages**

```bash
npm run dev
```

Open in mobile viewport (375px). Compare each page against its screenshot:
1. Landing page → `designs/DragonCandy_mobile_landing_page.png`
2. Login page → `designs/DragonCandy_login_page.png`
3. Business Dashboard → `designs/restaurant_dashboard_page.png`
4. Browse Creators → `designs/browse_creators_page.png`
5. Creator Portfolio → `designs/creator_portfolio_page.png`
6. Creator Profile → `designs/creator-business_profile.png`
7. Messaging → `designs/Messaging_page.png`
8. Available Campaigns → `designs/Creator_view_of_available_campaigns.png`

- [ ] **Step 2: Test dark mode**

Toggle dark mode. Verify all pages have correct dark mode colors (no white-on-white, no broken contrast).

- [ ] **Step 3: Test bottom nav and Donny chat**

Verify bottom nav appears on all authenticated pages. Test center Donny button opens chat sheet. Test navigation between pages.

- [ ] **Step 4: Test campaign swipe**

Navigate to Available Campaigns. Swipe left and right. Verify animations, card stack, and "Apply Now" CTA.

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: No TypeScript errors, no build failures.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(theme): address smoke test issues from UX theme update"
```
