---
title: Landing "Human-driven. AI-assisted." Redesign
type: concept
created: 2026-07-18
updated: 2026-07-19
sources: [2026-07-18-landing-joe-redesign.md]
tags: [landing, frontend, design, tailwind, positioning]
---
# Landing "Human-driven. AI-assisted." Redesign

The 2026-07-18 redesign of the public landing (`src/pages/LandingPage.tsx` +
`src/components/landing/*`, PR #293) to a founder-provided mockup ("Joe's design"). It
is both a visual rebuild **and** a strategic repositioning: the landing's headline story
moves from "AI generates your content, fast" to **"Human-driven. AI-assisted."** — a
real human creator becomes a business's social-media team, Donny (the AI) assists in the
background, humans drive every decision. The founder confirmed this reframing is "the
true purpose and user story of DragonCandy," not a cosmetic pass. It **supersedes**
[[Landing Cinematic Video Redesign]] as the shipped landing design (see that page's
supersession note) while deliberately **preserving** the cinematic-video system it built,
now gated off by default. Frontend + font-asset only — no schema, RLS, edge-function, or
secret change.

## Key Decisions

- **Positioning is the deliverable, not the paint job.** All copy is verbatim from Joe's
  mockup (hero H1, door copy, values, how-it-works steps, Donny copy, final CTA) — the
  spec explicitly instructs "do not soften back toward 'AI generates your content.'"
  Treat the messaging change as the headline fact of this redesign, with the visual
  rebuild as its vehicle.
- **A new, additive, landing-scoped visual identity.** New Tailwind `landing.*` color
  tokens (`grape #241332`, `pink #F43F7F`, `mint #2FC796`, `yellow #FFC93C`, `lilac
  #F4EDFA`, plus soft/line/ink variants) and three self-hosted font families —
  **Bricolage Grotesque** (`font-display`, headlines), **Instrument Sans**
  (`font-sans-alt`/`font-instrument`, body), **Silkscreen** (`font-pixel`, eyebrows/step
  numbers/footer tag) — wired via `@font-face` in `index.html` (the existing
  Outfit/Pacifico self-hosting pattern, no Google Fonts CDN, CSP untouched). These are
  **additive** to `tailwind.config.ts`: no existing `dc-*` token was renamed or removed
  (verified by diff), so the authenticated app — still on `dc-*` + Outfit — renders
  byte-unchanged. This is the general "landing = its own scoped marketing identity, app
  untouched" pattern, now applied a second time (the first was
  [[Landing Redesign & Public Lead Capture]]'s scoped `.dark` wrapper — see below for how
  this redesign differs from that approach).
- **The landing goes light, rejoining the rest of the app.** The app-theme-pivot decision
  ([[Dark-Luxe App Theme]], PRs #275/#277) deliberately carved out dark for **landing +
  login/sign-up + onboarding + `/internal`**, with everything else light. This redesign
  removes the landing's own scoped `.dark` wrapper entirely (`LandingPage.tsx` now
  renders on plain `bg-white`, no dark class anywhere in the tree) — the landing is now
  genuinely light, on its own additive `landing-*` system, distinct from but sitting
  alongside [[Light-App Kit]]'s `dc-*`/`AppCard` system. Auth, sign-up, onboarding, and
  `/internal` are explicitly **out of scope** here and remain dark via `useDarkHtml()`
  (confirmed `LandingPage.tsx` does not call it) — the dark-marketing exception now
  covers three surfaces instead of four.
- **Video system preserved, not deleted — demoted to opt-in.** Rather than ripping out
  the prior session's cinematic-video work (`RotatingBackdrop`, `landingClips`,
  `useLandingBackdropPlaylist`, `VideoSlot`, `MediaSlot`, and the DragonFeed real-clip
  adapter), it is kept intact and gated behind a new
  `LANDING_VIDEO_BACKDROP_ENABLED` flag in `src/lib/featureConfig.ts` (default `false`,
  mirrors `BRAND_ROLE_ENABLED`). A new `HeroVideoBackdrop.tsx` is the **sole** consumer
  — lazy-loaded by `HeroSection`, mounted only when the flag is on, so the video modules
  (and their Supabase/react-query fetch) stay out of the default bundle entirely. Two
  behavior changes versus the old wiring: (1) it's fixed to a **single**
  `"hero.business"` playlist key — no more per-role pill-driven clip switching, since
  the new hero is two static doors rather than a role-morphing switcher; (2) the scrim
  is **light** (white gradient) rather than dark, since the hero content sitting on top
  is now dark ink on a light page, not white text on a dark one. All underlying video
  behavior (rotation, the HEVC `.mov` guard, the 15s max-dwell no-stall watchdog,
  reduced-motion stills, the DragonFeed adapter) is unchanged — reused as-is. Re-enabling
  is a one-line flag flip plus real (non-AI) footage in `landingClips.ts`.
- **`HeroSection` carries `isolate`** so the flag-gated video layer (when eventually
  turned on) isn't hidden behind the section's `bg-white` — a proactive guard against
  the exact `.relative`-beats-`.absolute` stacking bug the *prior* cinematic redesign
  hit and had to fix reactively (see [[Landing Cinematic Video Redesign]]'s Known
  Issues).
- **Splash/flash discipline reapplied, in reverse.** `index.html`'s prerendered `#root`
  splash flipped from `#1A1A2A` (dark, tuned for the old dark landing) to `#FFFFFF`
  (light paper) to avoid a dark→light flash on cold load — the mirror image of the
  original "old-design flash fix" documented in
  [[Landing Prerendered Shell & Performance]] (which fixed a stale-dark-shell flashing
  before a lighter design). The lesson generalizes: whenever the landing's base
  background color changes, the prerendered splash and every landing-route Suspense
  fallback must be updated in the same change, or the flash regresses in whichever
  direction the color moved.
- **Conversion tools kept, backend untouched.** The paste-a-URL brief generator
  (`generate-anonymous-brief` via `BriefGeneratorPreview`, relocated into the
  "how it works" section) and the lead-capture pipeline (`useSubmitLead` →
  `capture-lead`, in the new `FinalCTASection`) are reused byte-identical on the
  backend — see [[Anonymous Brief Generator]] and
  [[Landing Redesign & Public Lead Capture]] for their mechanics, which this redesign
  does not change.
- **Two sections retired.** `AudienceLanes.tsx` (the old "pick your lane" section) and
  `ProofSection.tsx` (honest-empty testimonials) are deleted — the new hero's two doors
  plus the Values grid cover the former's job, and Joe's mockup has no testimonials
  section at all. `StartFreeSection.tsx` is replaced by the new `FinalCTASection.tsx`.

## Process

Brainstorm → independently-reviewed spec
(`docs/superpowers/specs/2026-07-18-landing-joe-redesign-design.md`) → independently-
reviewed plan (`docs/superpowers/plans/2026-07-18-landing-joe-redesign.md`) → 10
subagent-driven implementation tasks (each spec- and quality-reviewed) → a whole-branch
Opus review (three fixes: `scroll-mt-24` on the hero doors so the sticky header doesn't
tuck content when scrolled to; `LandingButton` merges classes via `cn()`/tailwind-merge
instead of raw concatenation + defaults `type="button"`; the nav logo became a
keyboard-activatable `<button aria-label="DragonCandy home">`) → Codex second review
(clean). 1017 tests pass, including untouched video-system suites kept green
(`landingClips.test.ts`, `useLandingBackdropPlaylist.test.tsx`, `RotatingBackdrop.test.ts`,
`VideoSlot.test.tsx`, `heroRole.test.ts`).

## Known Issues / Gotchas

- **`docs/runbooks/landing-video-backdrop-kit.md` is now stale.** It still documents the
  old per-role pill→clip-key mapping (separate business/creator/brand hero clips) and
  doesn't mention `LANDING_VIDEO_BACKDROP_ENABLED` or the new single-key,
  light-scrim `HeroVideoBackdrop.tsx` wiring. Needs a refresh before it's next used to
  produce clips — flagged as a follow-up, not fixed in this pass.
- **PR-branch vs. local-worktree-branch drift.** At knowledge-sync time the GitHub PR
  #293 branch head was a single squashed commit rebased onto the *latest*
  `origin/main` (landed via the git-push-blocked REST workaround — see
  [[Landing Cinematic Video Redesign]]/[[Dark-Luxe App Theme]] sessions for the same
  pattern), while the local worktree still held 17 discrete, unsquashed commits behind
  the actual remote state. Knowledge-sync docs were authored off the fetched PR head,
  not the stale local branch, so the doc edits land on the current
  `docs/PROJECT_CONTEXT.md`/`docs/wiki/index.md`/`docs/wiki/log.md`.

## See Also
- [[Auth + Onboarding Landing-Theme Retheme]] — 2026-07-19 follow-up (PR #299) that carries this
  landing's light identity into login/sign-up + onboarding, closing the "bright landing → dark
  auth" handoff this redesign left open; reuses the same `landing-*` tokens/fonts + `Eyebrow`/
  `LandingButton` primitives via a new `AuthShell`.
- [[Landing Cinematic Video Redesign]] — the dark, role-morphing landing this redesign
  supersedes as the shipped design; its video-backdrop system is preserved and reused
  here, now opt-in.
- [[Landing Redesign & Public Lead Capture]] — the original Dark-Luxe landing rebuild
  (scoped `.dark` wrapper technique) + the `leads`/`capture-lead` pipeline this redesign
  reuses untouched.
- [[Landing Prerendered Shell & Performance]] — the splash/flash discipline this
  redesign re-applies in the opposite (dark→light) direction.
- [[Anonymous Brief Generator]] — the "see it work" interactive proof block, relocated
  but logic-unchanged.
- [[Dark-Luxe App Theme]] — the app-wide light/dark scoping decision (landing +
  auth/onboarding/`/internal` = dark, everything else light) that this redesign narrows
  by removing the landing from the dark side.
- [[Light-App Kit]] — the authenticated app's own light design-token system; a distinct,
  parallel system from the landing's `landing-*` tokens (never mixed).
