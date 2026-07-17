# Session — Landing Cinematic AI-Video Redesign (2026-07-16)

Branch: `worktree-dc-landing-page-upgrade`. Frontend-only; no schema/edge-fn/secret change.
Spec: `docs/superpowers/specs/2026-07-16-landing-cinematic-video-redesign-design.md`.
Plan: `docs/superpowers/plans/2026-07-16-landing-cinematic-video-redesign.md`.

## Goal
Founder ask: re-design dragoncandy.io's public landing into a "cool, captivating" page that is
**less wordy**, uses **AI-generated content clips as the moving backdrop**, and gets **all three
roles** (Business / Creator / Brand) excited to sign up — using the best recommended tooling.

## What shipped
Evolved the existing `src/components/landing/*` (the 2026-06-28 Dark-Luxe rebuild) into a
**cinematic, kinetic, 6-section** page. Decisions made via the brainstorming visual companion:

- **Hero = Cinematic Dark Luxe + Kinetic energy.** Full-bleed dark hero with a faint drifting
  clip-wall behind a legibility scrim ("content everywhere" without competing with the headline).
- **Morphing role switcher (R2).** Pills `Business · Creator · Brand` at the top of the hero;
  tapping one re-films the hero — headline, backdrop clip, and CTA all key off the active role.
  Defaults to Business; `?role=creator` deep-links, own-property-guarded (rejects `constructor`).
  Brand pill gated by `BRAND_ROLE_ENABLED` (off) — hidden AND `?role=brand` no-ops to business.
- **Lean 6 sections:** Hero → See it work (the existing anonymous brief generator, elevated) →
  How it works (3 steps, ~3 words each) → Pick your lane (2–3 one-line lane cards) → Proof
  (merged Stories+Rewards, **honest** — no fabricated testimonials) → Start free (merged
  BottomCTA + lead-capture form). Copy cut to headline-plus-one-line everywhere. Six components
  retired (WhyDragonCandy, CreatorHubSection, StoriesSection, DragonRewardsSection, BottomCTA,
  LeadCaptureSection).
- **"Donny" everywhere**, never "Donny AI".
- **Transparent, scroll-aware header** (see gotcha below) + the real transparent `/logo.webp`.

## Architecture — the swappable clip seam (keystone)
A new **`landingClips.ts`** registry maps semantic keys (`hero.business`, `hero.creator`,
`hero.brand`, `proof.reel`) → `{ src, poster }`, resolved via `resolveLandingClip(key, registry?)`
/ `useLandingClip(key)`. v1 registry ships **empty** on purpose so `VideoSlot` degrades to its
branded gradient ("ship-before-clips" — the redesign goes live before any clip exists; the founder
drops Cloudflare Stream URLs into one file, no code change, to turn on video). The seam is
**source-agnostic**: a future **DragonFeed adapter** (real approved creator clips) swaps the source
behind the same hook with zero component changes — the landing then dogfoods the product and rides
the content flywheel that fills DragonFeed.

`heroRole.ts` (pure, unit-tested) holds role types, `visibleRoles(brandEnabled)`, the guarded
`parseRoleParam`, and the `HERO_CONTENT` per-role map (label/headline/accent/sub/CTA/clipKey).

`VideoSlot` gained an **additive `variant="backdrop"`** (full-bleed, controls-less, `object-cover`)
alongside the default framed player; all hardening kept (poster-first, `preload="none"`, in-view
IntersectionObserver gating, reduced-motion → poster only).

## Recommended clip pipeline (founder does this outside the code)
Control-the-still-then-animate: **Nano Banana Pro** on-brand stills → **image-to-video** via
**Veo 3.1** (hero money-shots) + **Kling 2.x / Runway Gen-4** (the many smaller reels) → 4–8s
silent seamless loops + poster stills. Serve via **Cloudflare Stream** (Bunny Stream = cheaper
fallback) behind the `landingClips` seam. It's *serving* cost (a few $/mo), not AI spend, so it
never touches the 15%-of-revenue AI cap.

## Gotchas found this session
1. **Backdrop full-bleed / Tailwind position-class ordering (Opus whole-branch review, Important).**
   The backdrop `VideoSlot` wrapper emitted `relative` while the hero passed `absolute inset-0`.
   Tailwind emits position utilities in the order `static, fixed, absolute, relative, sticky`, so
   `.relative` is defined *after* `.absolute` and **wins** at equal specificity → the wrapper
   computes to `position: relative`, becomes an in-flow ~half-width flex item, and is NOT
   full-bleed. Masked in the empty-clip state (scrim covers it) but breaks the instant a real clip
   URL is added — the exact go-live path, outside any review gate. Fix: the `backdrop` variant
   **self-positions `absolute inset-0`**; a regression test asserts the wrapper is `absolute` and
   not `relative`. Durable lesson: never rely on both `relative` and `absolute` on one element —
   the later-defined utility wins, silently.
2. **Logo overlap — size a TALL badge by HEIGHT, not width.** Header sized the logo by width
   (`w-[168px]`). `/logo.webp` is a tall badge (~0.9 h/w), so width-sizing made it ~150px tall — it
   dropped into the hero and overlapped the role pills / eyebrow / CTAs. Fix: cap by height
   (`h-16 lg:h-20 w-auto`, ~80px) matching the approved mockup. Found only in the browser pass.
3. **A fixed *transparent* header is illegible over bright scrolled content.** Pure "always
   transparent" (founder's literal ask) left dark nav text illegible over the bright pink lane
   card on scroll. Fix: **scroll-aware header** — transparent over the hero (what the founder sees
   on load and asked about), fades in `bg-dc-dark/80 backdrop-blur-xl border-b` once scrolled past
   ~16px (passive scroll listener). This was the design doc's documented fallback; the browser
   pass proved it necessary.
4. **The logged-out landing view.** `LandingPage` redirects authed users to `/dashboard`, so a
   logged-in local Chrome can't see the landing. To browser-verify, cleared only the
   `sb-*-auth-token` keys in localStorage for the `127.0.0.1:8080` origin (reversible; prod
   untouched). Note: `resize_window` did not reflow the viewport below the `md` breakpoint, so a
   true-mobile render needs verify-prod / on-device.

## Verification
Built subagent-driven (11 tasks, per-task spec+quality review; Tasks 1–3 pure/unit-tested TDD, the
rest presentational). Opus whole-branch review = "ready to merge with fixes" (1 Important = the
backdrop bug, all minors deferred). **Codex second review clean** ("did not find any discrete,
introduced issues…"). Browser-verified logged-out on desktop: hero + morphing pills
(Business↔Creator swap confirmed), brief generator, honest Proof band, scroll-aware header, no
console errors. Landing unit tests 14/14.

## Founder follow-ups (documented in the PR)
1. Create a Cloudflare Stream account; generate clips via the pipeline; drop playback URLs +
   posters into `LANDING_CLIPS` (no other code change → video goes live).
2. Confirm `LEADS_NOTIFY_EMAIL` edge secret is set.
3. Optionally fill real testimonials in `ProofSection`; align the gated rewards copy
   ("DC Points/DC Rewards") to the current "Reputation (Rep)" naming before flipping
   `DRAGON_REWARDS_ENABLED` on.
4. Re-login on `127.0.0.1:8080` local dev when next needed.
