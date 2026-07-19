---
title: Landing "Human-driven. AI-assisted." Redesign Session (Joe's direction)
type: source
created: 2026-07-18
tags: [landing, frontend, design, tailwind, positioning, session]
---
# Landing "Human-driven. AI-assisted." Redesign Session (Joe's direction)

Branch `feat/landing-joe-redesign`, PR #293 (open at time of writing). A full visual +
messaging redesign of the public landing page to a founder-provided mockup ("Joe's
design"), reframing DragonCandy's positioning from "AI generates your content, fast" to
**"Human-driven. AI-assisted."** — a real human creator becomes a business's social-media
team; Donny (the AI) assists in the background; humans drive every decision. The founder
confirmed this is "the true purpose and user story of DragonCandy," i.e. a strategic
repositioning, not a cosmetic refresh.

## What shipped

- **New landing-scoped visual identity**, additive to (never replacing) the app's
  `dc-*`/Outfit system:
  - Fonts: **Bricolage Grotesque** (`font-display`, headlines, weights 400/600/800),
    **Instrument Sans** (`font-sans-alt`/`font-instrument`, body, 400/500/600),
    **Silkscreen** (`font-pixel`, eyebrows/step numbers/footer tag, 400/700) — all
    self-hosted `.woff2` under `public/fonts/`, wired via `@font-face` in `index.html`
    (the existing Outfit/Pacifico pattern; no Google Fonts CDN, CSP untouched).
  - Palette: a new `landing.*` Tailwind color group — `grape #241332`, `grape-soft
    #3A2450`, `pink #F43F7F`, `pink-soft #FDE7F0`, `mint #2FC796`, `mint-soft #E2F8F0`,
    `yellow #FFC93C`, `lilac #F4EDFA`, `ink #241332`, `ink-soft #6B5A7E`, `paper
    #FFFFFF`, plus border tints (`line`/`pink-line`/`mint-line`) and button
    drop-shadow inks (`pink-ink #C22760`, `mint-ink #1E9C73`) — plus `landing-pink`/
    `landing-pink-hover`/`landing-mint`/`landing-mint-hover` box-shadow tokens for the
    chunky-button effect (`0 4px 0 <ink>` growing to `0 6px 0` on hover-lift).
  - `tailwind.config.ts` additions are **purely additive** — no existing `dc-*` token
    was renamed or removed, verified by diff; the authenticated app is byte-unchanged.
- **New light landing** (no `.dark` wrapper — the previous cinematic landing was dark
  via its own scoped `.dark` class; this one drops that wrapper entirely and renders on
  `bg-white`). Section order per the mockup:
  1. **Header** (`Header.tsx`, rewrite) — sticky white/blur nav, real `/logo.webp`
     (sized by height, `h-16 lg:h-20 w-auto`, not width — a tall-badge-logo lesson
     carried over from the prior cinematic redesign), section anchors (`#business` /
     `#creators` / `#how` / `#donny`), "Log in" text link, pink "Get started" CTA, and a
     mobile hamburger `Sheet` exposing all four anchors + Log in + Get started (Joe's
     mockup drops nav links on mobile with no replacement; the team decided to keep
     full navigability via the drawer).
  2. **Hero** (`HeroSection.tsx`, rewrite) + **HeroDoors.tsx** (new) — eyebrow "Human-
     driven · AI-assisted", H1 "Where **creators** and **entrepreneurs** build
     together" (pink/mint accent words), sub-copy, two hero CTAs that scroll in-page to
     `#business`/`#creators`, then the two doors (Business pink-soft, Creator
     mint-soft) whose own CTAs ("Find your creator" / "Find your clients") route to
     `/auth?mode=signup&role=business|creator` (own-property-guarded via the existing
     `heroRole.ts` `parseRoleParam`/`visibleRoles` guard — kept guard-only; the
     per-role morph-copy fields it used to drive are no longer consumed since the new
     hero is two static doors, not a role-morphing single hero).
  3. **Positioning band** (`PositioningBand.tsx`, new) — grape full-bleed band, yellow
     eyebrow, "A platform built for two kinds of builders."
  4. **Values** (`ValuesSection.tsx`, new) — 3-card grid ("Human connections, not
     algorithms" / "Run your business, don't just post" / "AI assists. Humans
     decide.").
  5. **How it works** (`HowItWorks.tsx`, rewrite) — lilac background, 3 pixel-numbered
     steps, and the **paste-a-URL brief generator** (`BriefGeneratorPreview`, restyled
     only) relocated here as the "see it work" live proof block (it previously lived
     inside the Donny section).
  6. **Meet Donny** (`DonnySection.tsx`, rewrite) — grape card with the **real**
     `src/assets/donny-emblem.webp` (not the pixel placeholder), rendered at 150px
     using the same crop treatment as `DonnyAvatar` elsewhere in the app
     (`object-cover scale-[1.35]` inside a circular mask, because the source asset has
     transparent padding — a naive `object-cover` alone leaves a visible empty ring).
     Copy: "The assistant in everyone's toolbelt... Donny never replaces the humans.
     Donny works for them."
  7. **Final CTA + lead capture** (`FinalCTASection.tsx`, new, replaces
     `StartFreeSection`), id `#join` — "Ready to build together?" + the existing
     lead-capture form (`useSubmitLead` → `capture-lead`, honeypot + audience fields
     unchanged, restyled only).
  8. **Footer** (inline in `LandingPage.tsx`) — pixel footer tag "DragonCandy ·
     Human-driven. AI-assisted." + logo + Contact (`#join`) / Terms / Privacy / Help.
  - **Removed from composition and deleted:** `AudienceLanes.tsx` (the old "pick your
    lane" section — replaced by the two hero doors + Values grid) and `ProofSection.tsx`
    (Joe's mockup has no testimonials section; the old one was honest-empty anyway).
    `StartFreeSection.tsx` was replaced by `FinalCTASection.tsx`.
- **Cinematic video system preserved, OFF by default.** `src/lib/featureConfig.ts`
  gained `export const LANDING_VIDEO_BACKDROP_ENABLED = false;` (mirrors the existing
  `BRAND_ROLE_ENABLED` pattern). A new `HeroVideoBackdrop.tsx` component is the
  **only** consumer of the video-backdrop system in the new landing — lazy-loaded by
  `HeroSection` and mounted only when the flag is on, so `RotatingBackdrop`,
  `useLandingBackdropPlaylist`, `landingClips`, `VideoSlot`, and `MediaSlot` all stay
  out of the default bundle (no clip fetch, no Supabase call, when off). Unlike the old
  role-morphing hero, `HeroVideoBackdrop` is fixed to a single `"hero.business"`
  playlist key (no per-role pill switching — the new hero is two static doors, not a
  role-morph switcher) and uses a **light** white gradient scrim (not the old dark
  scrim), since the hero content sitting on top is now dark ink on a light page. All
  underlying video behavior (rotation, the DragonFeed real-clip adapter, the HEVC
  `.mov` extension guard, the 15s max-dwell no-stall watchdog, reduced-motion stills)
  is unchanged because the modules are reused as-is — only the wiring around them
  changed. Re-enabling is a one-line flag flip plus real (non-AI) footage in
  `landingClips.ts`.
  - **Known drift (not fixed this session):** `docs/runbooks/landing-video-backdrop-kit.md`
    still describes the old role-morph pill→clip-key mapping (business/creator/brand
    each with their own hero clip) and doesn't mention `LANDING_VIDEO_BACKDROP_ENABLED`
    or `HeroVideoBackdrop.tsx`. It needs a refresh before the founder next uses it to
    produce clips — left as a flagged follow-up, out of this knowledge-sync's scope
    (explicit deliverable list didn't include the runbook).
- **`HeroSection` `isolate`** — the section carries `isolate` so the flag-gated video
  layer (when on) isn't hidden behind the section's `bg-white`; a whole-branch-review
  catch on the *prior* cinematic redesign (Tailwind `.relative` beating `.absolute` at
  equal specificity) was proactively guarded against here too.
- **Splash / flash fix.** `index.html`'s prerendered `#root` splash background changed
  from `#1A1A2A` (dark, tuned for the old dark landing) to `#FFFFFF` (the new landing's
  light paper) — logo-only, content-free. Without this, every cold load would flash
  dark→light, the same bug class the project already fixed once for the reverse
  direction (light→dark, "old-design flash fix", PR #253-era). `src/App.tsx`'s three
  landing-route Suspense fallbacks (`/`, `/home`, `/landing`) switched from
  `bg-dc-dark` to `bg-white` to match; the unrelated `/pitch` fallback is untouched.
- **Landing joins the "light app," carving itself back out of the dark-marketing
  exception.** Per the app-theme-pivot decision (PRs #275/#277), dark was deliberately
  scoped to landing + login/sign-up + onboarding + `/internal` (everything else went
  light). This redesign removes the landing's own `.dark` wrapper entirely — the
  landing is now genuinely light, on its own additive `landing-*` token system,
  joining the rest of the consumer app. Auth/sign-up/onboarding/`/internal` are
  explicitly out of scope and remain dark via `useDarkHtml()` (untouched — grepped to
  confirm `LandingPage.tsx` does not call it).
- **Whole-branch review fixes** (commit `77fd9d74`, after the Opus whole-branch pass):
  - `HeroDoors.tsx` — `scroll-mt-24` on `#business`/`#creators` so the sticky header
    doesn't tuck the eyebrow/heading when a hero CTA scrolls to a door.
  - `LandingButton.tsx` — classes now merged with `cn()` (tailwind-merge) instead of
    raw string concatenation, so a caller's `className` correctly wins on conflicts;
    the `<button>` branch now defaults `type="button"` so it can't accidentally submit
    a surrounding `<form>`.
  - `Header.tsx` — the logo is now a keyboard-activatable
    `<button aria-label="DragonCandy home">` wrapping the (decorative-by-label) `img`,
    instead of an `onClick`-only `<img>` (a11y fix).

## Key decisions

- **Positioning is the deliverable, not just the visuals.** All copy is verbatim from
  Joe's mockup; the brief explicitly says "do not soften back toward 'AI generates your
  content.'" This is recorded as a durable positioning fact, not just a UI change.
- **Conversion tools kept, logic untouched.** Both the anonymous brief generator
  (`generate-anonymous-brief`) and the lead-capture pipeline (`useSubmitLead` →
  `capture-lead`) are reused byte-identical on the backend — only their presentation
  moved/restyled.
- **Token additivity over token replacement.** New `landing-*` tokens + fonts are
  additive to `tailwind.config.ts`; nothing existing renamed or removed, so the
  authenticated app (still on `dc-*` + Outfit) renders unaffected.
- **Preserve, don't delete, the video system.** Rather than ripping out the prior
  session's cinematic-video work, it was demoted to an opt-in layer behind
  `LANDING_VIDEO_BACKDROP_ENABLED` — a deliberate "ship the new positioning now, keep
  the option to relight the video experience later with real (non-AI) footage."
- **This spec explicitly supersedes the *landing half* of a parked PR #279** (a prior,
  separate "light re-theme" effort) — #279's auth/onboarding light work is a separable
  concern and was left parked, untouched by this branch.

## Scope

Frontend + font assets only. Touched: `src/components/landing/*` (rewrites + 6 new
files: `HeroDoors.tsx`, `PositioningBand.tsx`, `ValuesSection.tsx`, `FinalCTASection.tsx`,
`HeroVideoBackdrop.tsx`, plus co-located tests), `src/pages/LandingPage.tsx`,
`src/App.tsx` (Suspense fallback colors only), `src/lib/featureConfig.ts` (new flag),
`tailwind.config.ts` (additive tokens), `index.html` (font-faces + splash color), and 8
new self-hosted font files under `public/fonts/`. Deleted:
`src/components/landing/AudienceLanes.tsx`, `ProofSection.tsx`,
`src/components/landing/../StartFreeSection.tsx` (superseded by `FinalCTASection.tsx`).
**No schema, RLS, edge-function, or secret changes** — `capture-lead`, `landing-clips`,
and the `leads` table are reused as-is.

## Process & reviews

Brainstorm → spec (`docs/superpowers/specs/2026-07-18-landing-joe-redesign-design.md`,
independently reviewed, revisions folded in for splash-flash, section ids, the CTA
funnel, removed sections, and the exact self-hosted font-weight count) → plan
(`docs/superpowers/plans/2026-07-18-landing-joe-redesign.md`, independently reviewed) →
10 subagent-driven implementation tasks (fonts/tokens/flag/splash; Eyebrow +
LandingButton primitives; Header; hero + doors + flag-gated video, with an in-task
review fix for the `isolate` stacking-context bug; positioning band + values;
how-it-works + relocated brief generator; Meet Donny; FinalCTASection; composition
wiring + footer + SEO + splash; whole-branch verification), each task spec- and
quality-reviewed individually. Then a whole-branch Opus review (verdict: ready to
merge, with the three fixes captured above, landed in commit `77fd9d74`), and a Codex
second review (clean). 1017 tests pass (co-located Vitest suites for every new/rewritten
landing component: `Header.test.tsx`, `HeroSection.test.tsx`, `LandingButton.test.tsx`,
`Eyebrow.test.tsx`, `PositioningBand.test.tsx`, `ValuesSection.test.tsx`,
`HowItWorks.test.tsx`, `DonnySection.test.tsx`, `FinalCTASection.test.tsx`, plus the
untouched video-system suites `landingClips.test.ts`, `useLandingBackdropPlaylist.test.tsx`,
`RotatingBackdrop.test.ts`, `VideoSlot.test.tsx`, `heroRole.test.ts` kept green).

## Gotcha: PR branch state vs. local worktree branch

At knowledge-sync time, the local worktree's `feat/landing-joe-redesign` branch (17
discrete commits) and the actual GitHub PR #293 branch head had diverged: the remote
branch is a **single squashed commit** (`f5088f99`) rebased onto the *latest*
`origin/main` — evidence that the code branch was landed via the established
`git push`-is-blocked REST workaround (blob→tree→commit→ref), which typically squashes.
`origin/main` had also moved 4 commits ahead in the interim (a "Light-App Kit" Phase 4 +
de-gray cleanup, unrelated files — confirmed file-disjoint from this branch's changes).
This knowledge-sync was authored on a fresh branch off the fetched PR head
(`f5088f99`), not off the stale local 17-commit branch, so the doc edits land on the
version of `docs/PROJECT_CONTEXT.md` / `docs/wiki/index.md` / `docs/wiki/log.md` that is
actually current on the PR/`origin/main`.

## Deferred / follow-ups

- Real footage + `LANDING_VIDEO_BACKDROP_ENABLED = true` (founder-run, per the existing
  clip-production runbook — which itself needs a refresh for the new single-key,
  light-scrim wiring described above).
- `docs/runbooks/landing-video-backdrop-kit.md` refresh (role-morph pill mapping is
  stale).
- Real testimonials/proof content (the mockup, like the prior redesign, ships with no
  testimonials section at all — Joe's design doesn't include one).
