# Landing Page — "Human-driven. AI-assisted." Redesign (Joe's direction)

> **Design spec.** Full visual + messaging redesign of the public landing page to
> Joe's reference mockup (`dragoncandylanding.html`). A real departure from the
> current landing — new positioning, new layout, new type + palette — confirmed by
> the founder as "the true purpose and user story of DragonCandy."

**Status:** Design approved (founder), pending spec review + founder spec read.
**Date:** 2026-07-18
**Branch:** `feat/landing-joe-redesign` (fresh off `origin/main`)
**Supersedes:** the landing half of PR #279 (light re-theme). #279 stays parked; its
auth/onboarding light work is separable and out of scope here.

---

## 1. Context & Goal

The current public landing (`src/pages/LandingPage.tsx` + `src/components/landing/*`)
is a **dark, cinematic, AI-video** experience whose copy leads with *"AI-powered
content, campaigns in hours."* The founders have decided that story is wrong: the
**true** DragonCandy positioning is **"Human-driven. AI-assisted."** — a real human
creator becomes a business's social-media team; Donny (the AI) assists in the
background; humans drive every decision. Joe produced a complete HTML mockup of the
landing that expresses this. This spec ports that mockup into the DragonCandy React
stack as the new landing.

**Goal:** Replace the landing with Joe's design and messaging — faithful to his type,
palette, layout, and copy — while (a) folding in the two working conversion tools we
already built (the paste-a-URL brief generator and the lead-capture form) and
(b) preserving the entire cinematic-video system behind an off-by-default toggle so it
can be re-enabled when real (non-AI) footage exists.

**Non-goals / out of scope:**
- Auth / sign-up / onboarding surfaces (PR #279 already lights those; not touched here).
- Any backend change — the `capture-lead` and `landing-clips` edge functions and the
  `leads` schema are reused **untouched** (no schema/RLS/edge-fn/secret work).
- `/internal`, `/pitch`, and the authenticated app — untouched.
- Brand role — stays hidden behind `BRAND_ROLE_ENABLED` (two doors only, as today).

---

## 2. Positioning & copy (source of truth)

All copy comes from Joe's mockup. The messaging **is** the deliverable — do not soften
back toward "AI generates your content." Verbatim copy per section:

- **Eyebrow (global motif):** `Human-driven · AI-assisted`
- **Hero H1:** "Where **creators** and **entrepreneurs** build together." ("creators"
  in pink, "entrepreneurs" in mint)
- **Hero sub:** "DragonCandy connects business owners with talented social media
  creators — and gives both the tools to run and grow their businesses. AI assists.
  Humans drive."
- **Hero CTAs:** "I run a business" (pink) · "I'm a creator" (mint)
- **Hero note:** "Real people. Real partnerships. AI in the toolbelt."
- **Business door:** *For business owners* — "Your own social media department —
  without hiring one." / "Get matched with a real, human creator who learns your brand
  and becomes your social team. Strategy, content, posting, engagement — handled by a
  person, sped up by AI." / CTA "Find your creator"
- **Creator door:** *For creators* — "Turn what you do every day into a real
  business." / "Get matched with businesses that need your skills. Steady work, real
  partnerships, and a platform that handles the back office so you can focus on
  creating." / CTA "Find your clients"
- **Positioning band:** *What DragonCandy is* — "A platform built for two kinds of
  builders." + Joe's paragraph (humans drive; AI in the background).
- **Values** — eyebrow *Why it works* / head "People first. Platform underneath." /
  3 cards: "Human connections, not algorithms" · "Run your business, don't just post" ·
  "AI assists. Humans decide." (with Joe's body copy).
- **How it works** — eyebrow *How it works* / head "From match to momentum." / 3 steps:
  "Tell us what you're building" · "Get matched with a person" · "Build together, faster."
- **Meet Donny:** "The assistant in everyone's toolbelt." / "Donny is DragonCandy's
  built-in AI — drafting, scheduling, and researching so creators and business owners
  move faster. **Donny never replaces the humans. Donny works for them.**"
- **Final CTA:** "Ready to build together?" / "Join the platform where real people do
  the work — and AI makes it fly."
- **Footer tag:** "DragonCandy · Human-driven. AI-assisted."

The `SEO` title/description in `LandingPage.tsx` is rewritten to match (e.g. title
"DragonCandy — Human-driven. AI-assisted." / description drawn from the hero sub).

---

## 3. Design decisions (locked with founder)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Conversion tools | **Keep both**, restyled into Joe's design (brief generator in the "how it works" area; lead form in the final CTA). |
| 2 | Video backdrop | **Drop from the landing, preserve in code** behind `LANDING_VIDEO_BACKDROP_ENABLED` (default `false`). Re-enable when real footage exists. |
| 3 | Type + palette | **Adopt Joe's exact fonts + palette**, scoped so the authenticated app is untouched. |
| 4 | Donny avatar | **Real `src/assets/donny-emblem.webp`** (the app's Donny), not the pixel version. Pixel motif survives only in the small eyebrow/label type. |
| 5 | Logo | **Real `/logo.webp`** in the nav, replacing Joe's placeholder pixel mark. No redraw. |

---

## 4. Design tokens (Joe's system, additive + non-leaking)

Added to `tailwind.config.ts` as **new, additive** tokens (the existing `dc-*` tokens
are untouched, so nothing the app uses changes). Because they're only referenced by
landing components, Joe's look cannot leak into the app.

**Palette** (new colors, e.g. under a `landing` key → `bg-landing-grape` etc.):
`grape #241332`, `grape-soft #3A2450`, `pink #F43F7F`, `pink-soft #FDE7F0`,
`mint #2FC796`, `mint-soft #E2F8F0`, `yellow #FFC93C`, `lilac #F4EDFA`,
`ink #241332`, `ink-soft #6B5A7E`, `paper #FFFFFF`, plus the border tints Joe uses
(`#EFE8F5`, `#F9BFD6`, `#B8ECDA`) and the button drop-shadow inks (`#C22760`,
`#1E9C73`).

**Type** — self-hosted woff2 in `/public/fonts/` + `@font-face` in `index.html`
(exactly the existing Outfit/Pacifico pattern — **no Google Fonts CDN**, CSP intact),
exposed as Tailwind `fontFamily`:
- `font-display` → **Bricolage Grotesque** (headlines; weights 400/600/800)
- `font-sans-alt` → **Instrument Sans** (body; 400/500/600) — *landing body only; the
  app keeps Outfit*
- `font-pixel` → **Silkscreen** (eyebrows / step numbers / footer tag; 400/700)

**Repeated Joe patterns** as small landing component classes or Tailwind utilities:
- **Chunky buttons** — pill, `box-shadow: 0 4px 0 <ink>` that grows to `0 6px 0` on
  hover-lift (`.btn-pink` on pink→#C22760, `.btn-mint` on mint→#1E9C73, `.btn-ghost`
  grape outline). Respect `prefers-reduced-motion` (no transform).
- **Eyebrow** — Silkscreen 11px, `.14em` tracking, uppercase, leading square bullet.
- **Door / value / step cards** — 20px radius, 2px border, pastel fills per Joe.

A `.dc-landing` (or per-component) light ground; **no `.dark` wrapper** (the app is
already light, so unlike the old landing there's nothing to scope-flip).

---

## 5. Structure & files

`LandingPage.tsx` composes the sections top→bottom. Section order (Joe's mockup):

**Section ids (per mockup, so the rewritten nav + footer anchors resolve):** the two
doors are `#business` / `#creators`, How-it-works `#how`, Meet-Donny `#donny`, and the
final section `#join`. Use these exactly.

1. **Nav** (`Header.tsx`, rewrite) — sticky white/blur; real `/logo.webp` sized for
   legibility (the lockup is a wordmark+badge, so ~52–56px tall, not a token 40px —
   tune in verification) at left; links *For businesses (`#business`) · For creators
   (`#creators`) · How it works (`#how`) · Meet Donny (`#donny`)*; then a **"Log in"**
   text link → `/auth` (returning users — Joe's mockup omits it; we keep it, as the
   current landing does) and a pink **"Get started"** → `/auth?mode=signup`.
   **Mobile:** Joe's mockup hides the section links with no replacement — instead add a
   **hamburger menu** (a drawer/`Sheet`) exposing ALL of it: the four section anchors
   **and** Log in + Get started. So on every viewport a user can both jump to any
   section and reach login/sign-up. (Mirror the current landing `Header`'s mobile-menu
   pattern; keep it accessible — focus-trap + `aria-expanded`.)
2. **Hero** (`HeroSection.tsx`, rewrite) — eyebrow, colored H1, sub, two CTAs, note,
   then the **two doors** (`#business` pink-soft, `#creators` mint-soft). Optional
   flag-gated video backdrop layer (see §6). Brand door omitted (gated).
   - **CTA funnel (per mockup):** the two *hero* CTAs ("I run a business" / "I'm a
     creator") scroll in-page to `#business` / `#creators`; the *door* CTAs ("Find your
     creator" / "Find your clients") are the ones that route to signup
     (`/auth?mode=signup&role=business|creator`, own-property guarded — reuse
     `heroRole.ts`'s guard). Doors may be a child `HeroDoors.tsx` or inline.
3. **Positioning band** (`PositioningBand.tsx`, new) — grape full-bleed; yellow eyebrow.
4. **Values** (`ValuesSection.tsx`, new) — 3-card grid; emoji chips on pastel tiles.
5. **How it works** (`HowItWorks.tsx`, rewrite) — lilac; 3 pixel-numbered steps; and
   the **brief generator** folded in here as a live "see it work" block
   (`BriefGeneratorPreview`, restyled — logic reused).
6. **Meet Donny** (`DonnySection.tsx`, rewrite) — grape card; **real Donny emblem**
   rendered large (~150px), circular, with a mint glow ring. **Crop treatment:** the
   emblem asset has transparent padding, so it MUST use the app's `DonnyAvatar`
   treatment — `object-cover` + `scale-[1.35]` inside an `overflow-hidden rounded-full`
   mask — so the art fills the circle and no transparent whitespace shows (a naive
   `object-cover` without the scale leaves a visible empty ring). Reframed "assistant in
   the toolbelt" copy. (The brief generator moves OUT of here into §5.)
7. **Final CTA + lead capture** (`FinalCTASection.tsx`, replaces `StartFreeSection`),
   id `#join` — "Ready to build together?" + two role CTAs + the **lead-capture form**
   (reuse `useSubmitLead` → `capture-lead`; keep honeypot + audience + all fields). The
   footer "Contact" link resolves here (`#join`).
8. **Footer** (inline in `LandingPage.tsx` or `LandingFooter.tsx`, rewrite) — pixel tag
   + About / Contact (`#join`) / Terms / Privacy (Terms/Privacy/Help route as today).

**Removed from composition:** `ProofSection` (Joe has no testimonials section; the
current one is honest-empty) **and `AudienceLanes`** (the current "pick-your-lane"
section — replaced by the two hero doors + the Values grid; the mockup has no separate
lanes section). Both files may be deleted or left unreferenced — decided in the plan.

**Preserved but gated (video system, §6):** `RotatingBackdrop.tsx`, `landingClips.ts`,
`useLandingBackdropPlaylist.ts`, `VideoSlot.tsx`, `MediaSlot.tsx` — kept, reused only
when the flag is on.

**Reused untouched:** `useSubmitLead.ts`, `BriefGeneratorPreview.tsx` logic (restyle
only), `SEO.tsx`, `usePrefersReducedMotion.ts`, `Reveal.tsx` (scroll reveal, kept for
section entrances).

**`heroRole.ts` — kept guard-only.** The new hero is two *static* doors (copy lives in
the door components), not the role-morph switcher, so `HERO_CONTENT`'s per-role
`headline/accent/sub/clipKey` is **no longer consumed** by the hero. Keep
`parseRoleParam` + `visibleRoles` (still used for the `?role=` guard + brand gating);
trim or leave the now-unused morph fields — decided in the plan. `heroRole.test.ts` is
updated to cover only the retained guard behavior, not morph copy.

**Config:**
- `src/lib/featureConfig.ts` gains `export const LANDING_VIDEO_BACKDROP_ENABLED = false;`.
- `index.html` — besides the new `@font-face` blocks, **update the prerendered `#root`
  splash background from `#1A1A2A` (dc-dark) to the landing's light paper `#FFFFFF`**.
  The splash was tuned to match the *current dark* landing; against the new **light**
  landing it would flash dark→light on every load — the exact bug class the project
  already fixed once (PROJECT_CONTEXT "old-design flash fix"). In-scope, required.

---

## 6. The video toggle

`LANDING_VIDEO_BACKDROP_ENABLED` (default `false`, mirrors `BRAND_ROLE_ENABLED`).

- **`false` (default):** Joe's clean illustrative hero — no video mounts, no clip
  fetch, no `landing-clips` call. This is the shipped state.
- **`true`:** the hero renders the existing `RotatingBackdrop` (via
  `useLandingBackdropPlaylist`) as a full-bleed backdrop **behind** Joe's hero content,
  with a scrim tuned for legibility. All current video behavior (rotation, DragonFeed
  adapter, reduced-motion stills, HEVC `.mov` guard, no-stall watchdog) is unchanged
  because the modules are reused as-is.

Nothing is deleted. Re-enabling is a one-line flag flip plus dropping real footage into
the `landingClips.ts` seam (runbook `docs/runbooks/landing-video-backdrop-kit.md`).

---

## 7. Testing

- **Unit (vitest, co-located):** update `Header.test.tsx` (new nav markup/logo, no
  dark-bg assertions), `HeroSection.test.tsx` (Joe's copy + doors; flag OFF renders no
  video, flag ON mounts backdrop — test both via the flag), `heroRole.test.ts` (retained
  guard behavior only — not morph copy),
  and add tests for the new `PositioningBand`/`ValuesSection` if they carry logic
  (mostly presentational → light tests). Keep `landingClips.test.ts` /
  `useLandingBackdropPlaylist.test.ts` / `RotatingBackdrop.test.ts` green (video system
  unchanged).
- **Build/lint/typecheck:** `npm run build`, `npm run lint`, `npm run typecheck`.
- **Both viewports** on the Vercel preview: layout matches Joe's mockup desktop +
  mobile (nav collapses, grids stack), real logo crisp, brief generator + lead form
  submit end-to-end, no console errors. `/internal` + app unaffected (token additivity
  regression check).
- **Reviews:** subagent-driven per-task review + whole-branch Opus review + **Codex
  second review** (required). No edge-fn deploy → `edge-function-reviewer` / `careful`
  not needed (frontend + assets only).

---

## 8. Risks / watch-items

- **Font loading / FOUT** — self-host all **eight** weights (Bricolage 400/600/800,
  Instrument 400/500/600, Silkscreen 400/700); `font-display: swap`; preload the hero
  display weight. Verify no CSP violation (no CDN).
- **Dark splash flash** — the `index.html` `#root` splash must go light with this
  change (see §5 Config), else the load flash regresses. Verify on a cold load.
- **Palette contrast** — Joe's `ink-soft #6B5A7E` body on white and white on grape both
  pass AA; verify the pink/mint button text contrast (white on `#F43F7F`, grape on
  `#2FC796`).
- **Token additivity** — confirm no existing `dc-*` token is renamed/removed; the app
  must render byte-identically (only new tokens added).
- **Reduced motion** — Joe's hover-lift + any reveal respect `prefers-reduced-motion`.
- **Two-door vs role param** — the guard in `heroRole.ts` must still reject gated/unknown
  roles so brand stays unreachable from the hero.

---

## 9. Reuse summary (what does NOT change)

No schema, RLS, edge function, secret, or OAuth scope changes. `capture-lead`,
`landing-clips`, `useSubmitLead`, the `leads` table, and the entire video-backdrop
module set are reused. This is a **frontend + font-asset** change only.
