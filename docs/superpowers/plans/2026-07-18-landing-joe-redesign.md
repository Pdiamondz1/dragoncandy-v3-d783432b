# Landing "Human-driven. AI-assisted." Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public landing page with Joe's "Human-driven. AI-assisted." design —
new type, palette, layout, and messaging — while folding in the existing brief generator +
lead form and preserving the cinematic-video system behind an off-by-default flag.

**Architecture:** Frontend + font assets only. New landing-scoped Tailwind tokens (additive —
the app's `dc-*` tokens are untouched), three self-hosted Google fonts, and a rewrite of the
`src/components/landing/*` section components + `LandingPage.tsx`. No backend/schema/edge-fn
changes: `capture-lead`, `generate-anonymous-brief`, `landing-clips`, `useSubmitLead`, and the
video modules are reused. The video backdrop is gated by a new `LANDING_VIDEO_BACKDROP_ENABLED`
flag (default `false`) and lazy-loaded so it isn't in the default bundle.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` + new `landing-*`
tokens), shadcn/ui (`Sheet`, `Button`, `Input`, `Textarea`, `Label`), vitest + Testing Library.

**Design source of truth:** the spec `docs/superpowers/specs/2026-07-18-landing-joe-redesign-design.md`
and the reference mockup `docs/superpowers/specs/assets/2026-07-18-joe-landing-reference.html`.
Copy is verbatim from the mockup (spec §2). Read both before starting.

---

## Global Constraints (bind every task)

- **Copy is Joe's, verbatim** (spec §2). Do not soften toward "AI generates your content." The
  positioning is human-first: creators become a business's social team; Donny *assists*.
- **Token additivity:** only ADD to `tailwind.config.ts` (`landing-*` colors, `display`/
  `instrument`/`pixel` families, chunky-button shadows). Never rename/remove a `dc-*` token —
  the authenticated app must render byte-identically.
- **No leakage:** Joe's palette/fonts are used ONLY by landing components. `/internal`, `/pitch`,
  auth, and the app are out of scope and untouched.
- **Section ids (per mockup):** doors `#business` / `#creators`, `#how`, `#donny`, final `#join`.
- **Brand stays hidden** behind `BRAND_ROLE_ENABLED` (two doors only). The door CTAs emit only
  `role=business` / `role=creator` literals; `AuthPage` has its OWN `?role=` own-property guard
  (`AuthPage.tsx`) that rejects any unknown/gated role on receipt, so a hidden role is never
  reachable. `heroRole.ts` / `parseRoleParam` is left unchanged (it becomes test-only after Task 4;
  do not delete it, and its `heroRole.test.ts` needs no change).
- **No backend changes.** Reuse `capture-lead`, `generate-anonymous-brief`, `landing-clips`,
  `useSubmitLead`, and the video modules (`RotatingBackdrop`, `landingClips`,
  `useLandingBackdropPlaylist`, `VideoSlot`, `MediaSlot`) as-is.
- **Accessibility + motion:** keyboard-reachable nav/menu, visible focus, `prefers-reduced-motion`
  respected (reuse `Reveal`; no transform on the chunky-button hover under reduced motion).
- After each task: `npm run build` + `npm run typecheck` + relevant `npx vitest run` green, then commit.

---

## File Structure

**Create:**
- `public/fonts/bricolage-grotesque-latin-{400,600,800}.woff2`, `instrument-sans-latin-{400,500,600}.woff2`, `silkscreen-latin-{400,700}.woff2`
- `src/components/landing/Eyebrow.tsx` — the pixel eyebrow label (Silkscreen + square bullet)
- `src/components/landing/LandingButton.tsx` — chunky pill button (pink / mint / ghost variants)
- `src/components/landing/HeroDoors.tsx` — the two Business/Creator door cards
- `src/components/landing/PositioningBand.tsx` — grape "two kinds of builders" band
- `src/components/landing/ValuesSection.tsx` — 3-card "why it works" grid
- `src/components/landing/HeroVideoBackdrop.tsx` — lazy, flag-gated video layer (wraps `RotatingBackdrop`)
- `src/components/landing/FinalCTASection.tsx` — "Ready to build together?" + lead form (replaces `StartFreeSection`)

**Modify:**
- `index.html` — add `@font-face` for the 3 families + preload hero display weight; splash `#1A1A2A`→`#FFFFFF`
- `tailwind.config.ts` — add `landing-*` colors, `display`/`instrument`/`pixel` fonts, chunky-button shadows
- `src/lib/featureConfig.ts` — add `LANDING_VIDEO_BACKDROP_ENABLED = false`
- `src/components/landing/Header.tsx` — light sticky nav, real logo (bigger), section links + Login + Get Started, restyled `Sheet` mobile menu
- `src/components/landing/HeroSection.tsx` — Joe's static hero + doors; flag-gated lazy video backdrop
- `src/components/landing/HowItWorks.tsx` — 3 pixel-numbered steps + the (relocated) brief generator
- `src/components/landing/DonnySection.tsx` — grape Donny card + real emblem (crop); brief generator removed
- `src/components/landing/BriefGeneratorPreview.tsx` — restyle CARD/CTA/LABEL to Joe's light palette (logic unchanged)
- `src/pages/LandingPage.tsx` — light `.dc-landing` wrapper, Joe's section order, pixel footer, SEO copy
- test files: `Header.test.tsx`, `HeroSection.test.tsx` (+ new light tests)

**Delete (removed from Joe's design):**
- `src/components/landing/AudienceLanes.tsx` + any test
- `src/components/landing/ProofSection.tsx` + any test
- `src/components/landing/StartFreeSection.tsx` (superseded by `FinalCTASection.tsx`)

**Preserved, unchanged (video system — reused only when the flag is on):**
`RotatingBackdrop.tsx`, `landingClips.ts`, `useLandingBackdropPlaylist.ts`, `VideoSlot.tsx`,
`MediaSlot.tsx`, `Reveal.tsx`, `usePrefersReducedMotion.ts`, `heroRole.ts` (guard kept as-is).

---

## Task 1: Foundation — fonts, tokens, splash, flag

**Files:** Create `public/fonts/*.woff2`; Modify `index.html`, `tailwind.config.ts`, `src/lib/featureConfig.ts`.

- [ ] **Step 1: Download the woff2 files (latin subset).** For each family fetch the CSS2 with a
  desktop-Chrome UA (returns woff2 gstatic URLs) and download the `/* latin */` block's woff2 for
  each weight into `public/fonts/`. Proven-working method:
  ```bash
  UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  # Bricolage Grotesque 400/600/800, Instrument Sans 400/500/600, Silkscreen 400/700
  curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap"
  curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap"
  curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap"
  # From each response, take the woff2 URL under the `/* latin */` comment for each weight, then:
  curl -s -o "public/fonts/<family>-latin-<weight>.woff2" "<gstatic-woff2-url>"
  ```
  Verify each file: `file public/fonts/*.woff2` → "Web Open Font Format (Version 2)".

- [ ] **Step 2: Add `@font-face` + preload to `index.html`.** Mirror the existing Outfit/Pacifico
  block (around lines 16–26). Add preload for the hero display weight
  (`bricolage-grotesque-latin-800.woff2`) and `@font-face` for all 8 weights, `font-display:swap`,
  `src:url(/fonts/<file>.woff2) format('woff2')`, family names `'Bricolage Grotesque'`,
  `'Instrument Sans'`, `'Silkscreen'`.

- [ ] **Step 3: Fix the splash.** In `index.html`, change the prerendered `#root` splash
  `background` from `#1A1A2A` to `#FFFFFF` (and any dark splash text color to a light-appropriate
  value). Grep `1A1A2A` in `index.html` to find it. This prevents the dark→light load flash.

- [ ] **Step 4: Extend `tailwind.config.ts`** (additive, inside `theme.extend`):
  ```ts
  fontFamily: {
    sans: ['Outfit', ...defaultTheme.fontFamily.sans],
    script: ['Pacifico', 'cursive'],
    display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
    instrument: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
    pixel: ['Silkscreen', 'monospace'],
  },
  // add under colors:
  landing: {
    grape: '#241332', 'grape-soft': '#3A2450',
    pink: '#F43F7F', 'pink-soft': '#FDE7F0',
    mint: '#2FC796', 'mint-soft': '#E2F8F0',
    yellow: '#FFC93C', lilac: '#F4EDFA',
    ink: '#241332', 'ink-soft': '#6B5A7E', paper: '#FFFFFF',
    'line': '#EFE8F5', 'pink-line': '#F9BFD6', 'mint-line': '#B8ECDA',
    'pink-ink': '#C22760', 'mint-ink': '#1E9C73',
  },
  // add under boxShadow:
  'landing-pink': '0 4px 0 #C22760',
  'landing-pink-hover': '0 6px 0 #C22760',
  'landing-mint': '0 4px 0 #1E9C73',
  'landing-mint-hover': '0 6px 0 #1E9C73',
  ```

- [ ] **Step 5: Add the video flag.** `src/lib/featureConfig.ts`:
  ```ts
  export const BRAND_ROLE_ENABLED = false;
  export const LANDING_VIDEO_BACKDROP_ENABLED = false;
  ```

- [ ] **Step 6: Verify + commit.** `npm run build` succeeds; a throwaway `bg-landing-grape
  font-display` usage compiles. `git add public/fonts index.html tailwind.config.ts src/lib/featureConfig.ts && git commit -m "feat(landing): fonts + landing tokens + video flag + light splash"`

---

## Task 2: Landing primitives — Eyebrow + chunky button

**Files:** Create `src/components/landing/Eyebrow.tsx`, `src/components/landing/LandingButton.tsx`
(+ co-located tests).

- [ ] **Step 1 (TDD):** `Eyebrow.test.tsx` — renders its text in a Silkscreen/`font-pixel`
  element with uppercase + a leading square marker. `LandingButton.test.tsx` — renders `variant`
  pink/mint/ghost with the right classes, forwards `onClick`, and renders as `<a>` when `href` is
  given (for anchor CTAs) else `<button>`.
- [ ] **Step 2:** Implement:
  - `Eyebrow` — `<span class="font-pixel text-[11px] tracking-[0.14em] uppercase inline-flex items-center gap-2">` with a `::before`-style square (a `<span className="h-2 w-2 bg-current">`); accepts `className` for color (e.g. `text-landing-pink`).
  - `LandingButton` — pill (`rounded-full font-semibold px-6 py-3`), variants: `pink` (`bg-landing-pink text-white shadow-landing-pink hover:shadow-landing-pink-hover`), `mint` (`bg-landing-mint text-landing-grape shadow-landing-mint hover:shadow-landing-mint-hover`), `ghost` (`border-2 border-landing-grape text-landing-grape hover:bg-landing-lilac`). Hover lift `hover:-translate-y-0.5` gated `motion-safe:`. Focus ring `focus-visible:outline-landing-yellow`. Polymorphic: `href` → `<a>`, else `<button>`.
- [ ] **Step 3:** `npx vitest run src/components/landing/Eyebrow.test.tsx src/components/landing/LandingButton.test.tsx` green; build; commit.

---

## Task 3: Nav (Header rewrite)

**Files:** Modify `src/components/landing/Header.tsx`, `src/components/landing/Header.test.tsx`.

Current `Header.tsx` already has the target structure (section links + Login + Get Started +
`Sheet` mobile menu). Restyle it light + Joe's tokens + correct targets; keep the `#main-content`
scroll caveat awareness but simplify since the new nav is opaque.

- [ ] **Step 1 (TDD):** Update `Header.test.tsx` to assert (light nav): the logo `img`
  (`/logo.webp`), the four section buttons targeting `business`/`creators`/`how`/`donny`, a
  "Log in" control → `/auth?mode=login`, a "Get started" → `/auth?mode=signup`, and that the
  mobile `Sheet` contains the same links + auth. Remove any `bg-dc-dark`/`text-white` assertions.
- [ ] **Step 2:** Rewrite `Header.tsx`:
  - Container: `sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-landing-line`. (Sticky
    works inside `#main-content`; the nav is opaque so drop the `pointer-events-none` +
    wheel-forward + scroll-state machinery — it existed only for a transparent-over-video header.)
  - `navLinks = [{label:'For businesses',target:'business'},{'For creators','creators'},{'How it works','how'},{'Meet Donny','donny'}]`.
  - Logo: `<img src="/logo.webp" className="h-12 lg:h-14 w-auto" />` → `navigate('/')` (sized for
    legibility; tune 48–56px in verification).
  - Desktop (`hidden md:flex`): the four links (`text-landing-ink-soft hover:text-landing-ink`),
    then a "Log in" text link → `/auth?mode=login`, then `<LandingButton variant="pink"
    onClick={()=>navigate('/auth?mode=signup')}>Get started</LandingButton>`.
  - Mobile (`md:hidden`): keep the `Sheet` (restyle `SheetContent` light: `bg-white text-landing-ink`);
    body lists the four section links + a divider + Log in + a pink Get started. Keep the
    `handleNavClick` close-then-scroll pattern (350ms) and `aria-label`.
- [ ] **Step 3:** vitest (Header) green; build; commit.

---

## Task 4: Hero + doors + flag-gated video

**Files:** Modify `src/components/landing/HeroSection.tsx`, `src/components/landing/HeroSection.test.tsx`;
Create `src/components/landing/HeroDoors.tsx`, `src/components/landing/HeroVideoBackdrop.tsx`.

- [ ] **Step 1 (TDD):** `HeroSection.test.tsx` — renders the eyebrow "Human-driven · AI-assisted",
  the headline text ("build together"), the two hero CTAs ("I run a business" / "I'm a creator")
  that scroll to `#business`/`#creators` (assert `href="#business"` etc. or scroll handler), and
  the two doors with their CTAs routing to `/auth?mode=signup&role=business|creator`. Add a test
  that with the flag mocked OFF no video backdrop renders, and mocked ON `HeroVideoBackdrop`'s
  container mounts (mock `useLandingBackdropPlaylist` + `RotatingBackdrop`). NOTE:
  `LANDING_VIDEO_BACKDROP_ENABLED` is a top-level import, so a hoisted `vi.mock('@/lib/featureConfig')`
  binds the whole file — to test both flag states, use `vi.resetModules()` + a dynamic
  `await import('./HeroSection')` per case (or split into two test files). Don't expect a single
  hoisted mock to toggle per-test.
- [ ] **Step 2: `HeroDoors.tsx`** — the two door cards per mockup: Business (`#business`,
  `bg-landing-pink-soft border-landing-pink-line`, eyebrow "For business owners", "Your own social
  media department — without hiring one.", body, `<LandingButton variant="pink"
  href="/auth?mode=signup&role=business">Find your creator</LandingButton>`) and Creator
  (`#creators`, `bg-landing-mint-soft border-landing-mint-line`, "For creators", "Turn what you do
  every day into a real business.", body, mint "Find your clients" → `role=creator`). Guard the
  role param at the emit site is unnecessary (fixed literals); the consuming `AuthPage` already
  guards `?role=`.
- [ ] **Step 3: `HeroVideoBackdrop.tsx`** — the ONLY consumer of the video system in the new
  landing. Calls `useLandingBackdropPlaylist('hero.business')`, renders `<RotatingBackdrop
  key={playlistSignature('business', playlist)} playlist={playlist} className="-z-20" />` plus a
  **light** scrim (`bg-gradient-to-t from-white via-white/85 to-white/40 -z-10`). This component is
  rendered ONLY when the flag is on and is **lazy-loaded** so the video modules stay out of the
  default bundle.
- [ ] **Step 4: `HeroSection.tsx`** — Joe's static hero (light):
  - `<section id="hero" className="relative overflow-hidden bg-white pt-28 pb-16 text-center">`.
  - `{LANDING_VIDEO_BACKDROP_ENABLED && <Suspense fallback={null}><HeroVideoBackdrop/></Suspense>}`
    with `const HeroVideoBackdrop = lazy(() => import('./HeroVideoBackdrop'))`.
  - Eyebrow, H1 (`font-display` with "creators" in `text-landing-pink`, "entrepreneurs" in
    `text-landing-mint`), sub (`text-landing-ink-soft`), hero CTAs (`LandingButton` pink/mint whose
    onClick smooth-scrolls to `#business`/`#creators`), the note, then `<HeroDoors/>`.
  - Text color is dark ink (`text-landing-ink`) — legible on white, and on the light scrim when the
    flag is on. Remove the old role-morph pills, clip-wall, dark scrim, and all `HERO_CONTENT` /
    `parseRoleParam` usage from the hero (the doors are static). Leave `heroRole.ts` itself
    unchanged — it stays exported + tested, just no longer consumed by the hero.
- [ ] **Step 5:** vitest (HeroSection) both flag states green; build; commit.

---

## Task 5: Positioning band + Values

**Files:** Create `src/components/landing/PositioningBand.tsx`, `src/components/landing/ValuesSection.tsx`
(+ light render tests).

- [ ] **Step 1 (TDD):** render tests assert the band head "A platform built for two kinds of
  builders." and the three value headings ("Human connections, not algorithms" / "Run your
  business, don't just post" / "AI assists. Humans decide.").
- [ ] **Step 2:** Implement per mockup:
  - `PositioningBand` — `bg-landing-grape text-white` full-bleed section; yellow `Eyebrow` "What
    DragonCandy is"; `font-display` head; body `text-[#CBB9E0]` with `<strong className="text-white">`.
  - `ValuesSection` — white section; centered `Eyebrow` "Why it works" (pink) + head "People first.
    Platform underneath."; 3-col grid (`md:grid-cols-3`, stack on mobile) of bordered cards
    (`border-2 border-landing-line rounded-[20px] hover:border-landing-pink`), each with an emoji
    chip on a pastel tile + `font-display` h3 + `text-landing-ink-soft` body. Wrap items in `Reveal`.
- [ ] **Step 3:** vitest green; build; commit.

---

## Task 6: How it works + brief generator

**Files:** Modify `src/components/landing/HowItWorks.tsx`, `src/components/landing/BriefGeneratorPreview.tsx`.

- [ ] **Step 1: Restyle `BriefGeneratorPreview.tsx`** (logic unchanged — it calls
  `generate-anonymous-brief`, honeypot, 200-discriminator, pendingBrief save). Swap the dark-luxe
  consts to Joe's light palette:
  - `CARD` → `max-w-md mx-auto rounded-2xl border-2 border-landing-line bg-white p-6 space-y-4 shadow-[0_14px_30px_rgba(36,19,50,0.08)]`
  - `CTA` → chunky pink (`bg-landing-pink text-white shadow-landing-pink hover:shadow-landing-pink-hover rounded-full h-12 w-full font-semibold`)
  - `LABEL` → `text-xs font-semibold uppercase tracking-wide text-landing-ink-soft`
  - Swap all `text-white*` → `text-landing-ink`/`text-landing-ink-soft`, `bg-white/5`→`bg-white`,
    `border-white/15`→`border-landing-line`, icon `text-dc-teal`→`text-landing-mint`, the
    source-quality note `text-dc-yellow`→`text-landing-ink-soft`.
  - Reframe the headline copy to the assist voice (e.g. "Generate a free draft campaign brief in
    60 seconds." stays; keep it a *starting point Donny drafts for you*, not "AI does it all").
- [ ] **Step 2: Rewrite `HowItWorks.tsx`** — `id="how"`, `bg-landing-lilac`; centered `Eyebrow`
  "How it works" + head "From match to momentum."; a 3-col grid of white step cards each with a
  Silkscreen `font-pixel` decimal-leading-zero number (`01/02/03`) + `font-display` h3 + body
  ("Tell us what you're building" / "Get matched with a person" / "Build together, faster."). Below
  the steps, a "see it work" block (`id="see-it-work"`) with a short pixel eyebrow + the lazy
  `<Suspense><BriefGeneratorPreview/></Suspense>` (move the `lazy(import('./BriefGeneratorPreview'))`
  here from `DonnySection`). Wrap groups in `Reveal`.
- [ ] **Step 3:** build + typecheck; a light render test for HowItWorks (asserts the 3 step
  headings + that the brief-generator block is present); commit.

---

## Task 7: Meet Donny (grape card + real emblem)

**Files:** Modify `src/components/landing/DonnySection.tsx`.

- [ ] **Step 1:** Rewrite `DonnySection.tsx` — `id="donny"`; a grape card
  (`bg-landing-grape text-white rounded-[28px] p-10 lg:p-14`) in a `grid lg:grid-cols-[auto_1fr]
  gap-10 items-center` (stack + center on mobile). Left: the **real emblem** —
  `import donnyEmblem from '@/assets/donny-emblem.webp'` rendered ~150px, circular, with the app's
  crop so no transparent padding shows:
  ```tsx
  <span className="inline-flex h-[150px] w-[150px] overflow-hidden rounded-full shadow-[0_0_0_5px_rgba(47,199,150,0.35)]">
    <img src={donnyEmblem} alt="Donny" className="h-full w-full object-cover scale-[1.35]" loading="lazy" />
  </span>
  ```
  Right: mint `Eyebrow` "Meet Donny"; `font-display` head "The assistant in everyone's toolbelt.";
  body (`text-[#CBB9E0]`) with the "Donny never replaces the humans. Donny works for them."
  `<strong className="text-white">`. Remove the brief-generator import (moved to Task 6).
- [ ] **Step 2:** build + typecheck; light render test (emblem alt "Donny", the head, the strong
  line); commit.

---

## Task 8: Final CTA + lead capture

**Files:** Create `src/components/landing/FinalCTASection.tsx`; Delete `src/components/landing/StartFreeSection.tsx`.

- [ ] **Step 1:** Create `FinalCTASection.tsx` by porting `StartFreeSection.tsx`'s lead-form logic
  verbatim (state, `EMAIL_RE`, `useSubmitLead`, honeypot `website`, `handleSubmit`) — DO NOT change
  the submit path. Restyle to Joe's light palette and rewrite the copy:
  - `id="join"`, white section.
  - Top CTA block: `font-display` head "Ready to build together?"; sub "Join the platform where
    real people do the work — and AI makes it fly."; two chunky CTAs — pink "I run a business" →
    `signupAs('business')`, mint "I'm a creator" → `signupAs('creator')` (keep the
    `BRAND_ROLE_ENABLED` brand CTA gated).
  - Lead form: restyle the fields to light (`FIELD` → `h-12 rounded-xl border-2 border-landing-line
    bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint`),
    labels `text-landing-ink-soft`, submit = chunky pink. **Update the `reasons` array off the old
    positioning** — drop "DragonDash rush delivery"; use human-first reasons (e.g. "See a live demo
    built around your business" / "Get matched with local creators" / "Talk through how it works").
    Keep the success state.
- [ ] **Step 2:** Do NOT delete `StartFreeSection.tsx` yet — `LandingPage.tsx:10,42` still imports
  and renders it, so deleting it here would red the build in this task's own verify step. The
  import swap + file deletion happen together in Task 9 (Steps 1–2). This task only *adds*
  `FinalCTASection.tsx`; the old section keeps rendering until Task 9.
- [ ] **Step 3:** build + typecheck (both `StartFreeSection` and the new `FinalCTASection` compile;
  landing still renders the old one — that's expected); a render test asserting the head, the two
  role CTAs, and that submitting an invalid email shows the validation error (reuse the existing
  logic); commit.

---

## Task 9: LandingPage composition + footer + SEO

**Files:** Modify `src/pages/LandingPage.tsx`; delete `AudienceLanes.tsx`, `ProofSection.tsx`
(+ their tests). Check `src/App.tsx` Suspense fallbacks.

- [ ] **Step 1:** Rewrite `LandingPage.tsx`:
  - Wrapper: `<div className="dc-landing min-h-screen overflow-x-hidden bg-white text-landing-ink font-instrument">` (drop `dark bg-dc-dark text-white`).
  - `SEO` → title "DragonCandy — Human-driven. AI-assisted.", description from the hero sub.
  - Compose in Joe's order: `<Header/>` then `<main>`: `<HeroSection/>` (hero + doors) →
    `<PositioningBand/>` → `<ValuesSection/>` → `<HowItWorks/>` (steps + brief generator) →
    `<DonnySection/>` → `<FinalCTASection/>`.
  - **Swap the import:** replace the `StartFreeSection` import with `FinalCTASection`; remove the
    `AudienceLanes` and `ProofSection` imports.
  - Footer: pixel tag "DragonCandy · Human-driven. AI-assisted." + `/logo.webp` + Contact (`#join`)
    / Terms (`/terms`) / Privacy (`/privacy`) / Help (`/help`), on light chrome (`border-t
    border-landing-line`). (Omit the mockup's "About" — there is no `/about` route; don't add a
    dead link.)
- [ ] **Step 2:** Now delete `AudienceLanes.tsx`, `ProofSection.tsx`, **and `StartFreeSection.tsx`**
  (its only importer, `LandingPage.tsx`, was just repointed in Step 1) plus their test files. Grep
  the repo for any remaining importers of the three deleted components; there should be none.
- [ ] **Step 3:** In `src/App.tsx`, the landing lazy/`Suspense` fallbacks use `bg-dc-dark` on
  **all three** landing routes (`/`, `/home`, `/landing`, around `App.tsx:178–180`) — switch each
  to `bg-white` (prevent a dark flash before the light landing paints), and update the now-stale
  dark-splash comment above them (`~:176–177`). **Do NOT touch** the unrelated `bg-dc-dark` on the
  authenticated app-shell loading state (`~:420`) — that surface stays as-is. Grep `bg-dc-dark` in
  `App.tsx` to locate all four; change only the three landing fallbacks.
- [ ] **Step 4:** `npm run build` + `npm run typecheck` + `npm run lint` green; commit.

---

## Task 10: Whole-branch verification

**Files:** none (verification + cleanup).

- [ ] **Step 1:** `npm run test` (vitest) — the landing suite + the untouched video-module tests
  (`landingClips.test`, `useLandingBackdropPlaylist.test`, `RotatingBackdrop.test`) all green. Fix
  any test still asserting the old dark classes.
- [ ] **Step 2:** `npm run build`; confirm the default bundle does NOT contain the video modules
  (they're behind the lazy, flag-gated `HeroVideoBackdrop`). Confirm fonts load with no CSP error.
- [ ] **Step 3:** Manual on the Vercel preview, both viewports: layout matches the mockup
  (desktop + mobile), the nav hamburger opens section links + Log in + Get started, the brief
  generator + lead form submit end-to-end, no console errors, and `/internal` + the app are
  visually unchanged (token-additivity regression). No dark flash on cold load. Confirm the header
  logo size reads well; tune `h-12/h-14` if needed.
- [ ] **Step 4:** Flip `LANDING_VIDEO_BACKDROP_ENABLED = true` locally as a one-off smoke check —
  the video backdrop + light scrim render behind the hero and the hero copy stays legible — then
  revert to `false`. (Ships off.)

---

## Reviews & finish

- Per-task: superpowers:subagent-driven-development two-stage review (spec compliance + quality).
- Whole-branch Opus review at the end.
- **Codex second review** (required) — `codex review --base main --title "landing joe redesign"`;
  fix + re-run until clean.
- No edge-function deploy → `edge-function-reviewer` / `careful` not needed (frontend + assets only).
- On finish: `knowledge-sync` (new concept page for the redesign; refresh PROJECT_CONTEXT workstream
  + DESIGN_SYSTEM if the landing token layer is worth documenting), then open the PR via the REST
  overlay (git push is blocked in this env).
