---
title: Landing Cinematic Video Redesign
type: concept
created: 2026-07-16
updated: 2026-07-17
sources: [2026-07-16-landing-cinematic-video-redesign.md, 2026-07-17-dragonfeed-backdrop-adapter.md]
tags: [landing, frontend, video, design, tailwind, dragonfeed]
---
# Landing Cinematic Video Redesign

The 2026-07-16 evolution of the public landing (`src/components/landing/*` +
`src/pages/LandingPage.tsx`) from the Dark-Luxe rebuild ([[Landing Redesign & Public Lead Capture]])
into a **cinematic, kinetic, 6-section** page with a **morphing per-role hero** and a **swappable
AI-video backdrop**. Frontend-only — no schema/edge-fn/secret change.

## Key Decisions

- **Morphing role switcher (R2).** One cinematic hero with `Business · Creator · Brand` pills;
  tapping a pill re-films headline + backdrop clip + CTA. Keeps a single captivating statement
  while making each role feel addressed. Role logic (`heroRole.ts`) is pure + unit-tested:
  `visibleRoles(brandEnabled)`, a `HERO_CONTENT` map, and `parseRoleParam` (own-property-guarded
  like `AuthPage` — rejects `?role=constructor`; a gated/unknown role no-ops to business, so a
  flag-hidden role is never reachable from the hero).
- **Lean 6 sections.** Hero → See it work ([[Anonymous Brief Generator]], elevated as early proof)
  → How it works → Pick your lane → Proof → Start free. Copy is headline-plus-one-line. Six
  components retired.
- **Honest Proof band.** Pre-revenue, so the merged Stories+Rewards band ships `testimonials: []`
  (a founder-fillable slot, no fabricated quotes) + verifiable trust chips only. The rewards
  teaser is `useDragonRewardsEnabled()`-gated to its own sub-block.
- **Swappable clip-source seam (the keystone).** `landingClips.ts` maps semantic keys
  (`hero.business`, …) → `{ src, poster }` via `resolveLandingClip`/`useLandingClip`. v1 ships an
  **empty** registry so `VideoSlot` degrades to its gradient (**ship-before-clips** — the redesign
  goes live before any clip exists; the founder pastes Cloudflare Stream URLs into one file to turn
  on video). Source-agnostic by design — proven true on 2026-07-17, see "DragonFeed backdrop
  adapter (shipped)" below: a real second clip source was added **with zero changes to any
  consuming component**.
- **Clip pipeline (founder, outside code):** control-the-still-then-animate — Nano Banana Pro
  stills → image-to-video (Veo 3.1 for hero money-shots; Kling / Runway for the many reels) →
  4–8s silent loops + posters → serve via **Cloudflare Stream** (Bunny = cheaper fallback) behind
  the seam. Serving cost, not AI spend.
- **`VideoSlot variant="backdrop"`** — additive full-bleed, controls-less variant; the default
  framed player is byte-unchanged. All hardening kept (see [[Landing Prerendered Shell & Performance]]).

## DragonFeed Backdrop Adapter (shipped, PR #268, 2026-07-17)

The predicted "future DragonFeed adapter" above is now built: the hero backdrop **leads with
real boosted DragonShare video when any exists**, falling back to the curated static clips
otherwise. Video-only; no schema/RLS/migration/secret.

- **Source: a new anon edge fn `landing-clips`** (`verify_jwt=true`, the platform default — no
  `config.toml` entry). Service-role reads `dragonshare_posts` for eligibility: `status='verified'
  AND flagged_at IS NULL AND boost_status='boosted' AND content_type IN ('video','reel') AND
  content_file_path IS NOT NULL AND content_file_path ~* '\.(mp4|webm|mov)$'`, plus an
  inner-joined `dragonshare_boosts` row (`status IN ('captured','transferred')`). Returns ONLY
  `{ src, poster? }` — public URLs, never a row, never PII. Never throws to the client: any
  failure → `{ clips: [] }`.
- **Curation gate = a paid boost**, not "all verified." DragonShare is
  [[Trust-Then-Flag Model|trust-then-flag]] (live immediately, flagged post-hoc), so putting
  every verified post in front of anonymous top-of-funnel traffic would be too risky with no
  human review step. A captured/transferred boost — a restaurant paying real money to amplify
  this specific post — is a cheap, structural quality signal.
- **Frontend seam:** a new `useLandingBackdropPlaylist(key)` hook returns the static playlist
  immediately (no flash), React-Query-fetches the dynamic clips once, and merges via a new pure
  `mergeBackdropPlaylist` in `landingClips.ts` — **dynamic leads, static backfills**, de-duped,
  capped at 6, same-reference-when-nothing-changed (so nothing spuriously remounts). `hero.brand`
  stays static-only (still hidden behind `BRAND_ROLE_ENABLED`).
- **Index-based rotation needs a content-aware remount key.** `RotatingBackdrop` tracks its two
  crossfading `<video>` layers by array index, so `HeroSection` now keys it on a new pure
  `playlistSignature(role, playlist)` (role + joined `src`s) instead of `key={role}` — a
  same-length-different-clips swap (dynamic clips arriving after mount) would otherwise never be
  reflected, since neither the role nor the array length changed.
- **No-stall fix, found by the whole-branch review, not the per-task reviews.**
  `RotatingBackdrop` only ever advanced on a clip's `onEnded`. Once the source can include a real
  (not curated) user upload, an undecodable or unreachable clip — a bad codec, a 404, a corrupt
  file — **never fires `ended`**, only `error`; with dynamic clips now potentially leading at
  index 0, one bad boosted upload would freeze the hero on a blank layer forever. Fixed by
  advancing on `onError` too (and skipping an already-errored preloaded clip when it would next
  become visible). The extension guard alone (`\.(mp4|webm|mov)$`) does not cover this — a
  `.mov` container can still hold an HEVC stream Chrome can't decode.
- **The feature was not latent.** The whole-branch review queried prod directly and found
  **5 eligible boosted rows already existed** (the leading/newest one a `.MOV`) — verify against
  prod data before assuming a cold start.
- **Vercel PREVIEW builds point at the STAGING Supabase project** (see [[QA CI/CD Gate]]), so a
  prod-content feature like this cannot be visually E2E-verified on a PR preview (staging's
  `dragonshare_posts` has no eligible boosted rows). Verified instead via the prod edge-fn
  boot-check (real clips returned), unit tests on the pure helpers, and a synthetic `error` event
  fired on the real preview bundle to prove the no-stall fix client-side; true visual proof
  (does the hero show it logged-out) is inherently post-merge on prod.
- Reviews: Opus whole-branch (caught the no-stall gap) → `edge-function-reviewer` PASS →
  Codex second review clean → `careful`-gated CLI deploy (`verify_jwt=true` preserved,
  boot-checked) → merged and prod-live.

## Known Issues / Gotchas

- **Tailwind position-utility ordering.** Never put both `relative` and `absolute` on one element.
  Tailwind emits them `static, fixed, absolute, relative, sticky`, so the **later-defined utility
  wins** at equal specificity — `.relative` beats `.absolute`. The backdrop `VideoSlot` originally
  emitted `relative` while the hero passed `absolute inset-0`, so it computed to `relative` (in-flow,
  ~half width) and was NOT full-bleed. Masked in the empty-clip state; would have broken the moment
  a real clip URL was added (the go-live path, outside any review gate). Fix: the backdrop variant
  **self-positions `absolute inset-0`**, guarded by a regression test. (Caught by the Opus
  whole-branch review, not the per-task reviews.)
- **Size a tall logo by HEIGHT, not width.** `/logo.webp` is a tall badge (~0.9 h/w). Width-sizing
  (`w-[168px]`) made it ~150px tall and overlapped the hero content. Cap by height
  (`h-16 lg:h-20 w-auto`). Only visible in a browser pass.
- **A fixed *transparent* header is illegible over bright scrolled content.** Make it
  **scroll-aware**: transparent over the hero, fade in `bg-dc-dark/80 backdrop-blur-xl border-b`
  once scrolled past ~16px (passive scroll listener). Pure always-transparent leaves dark nav
  illegible over bright sections — proven in the browser pass.
- **Verifying a logged-out landing.** `LandingPage` redirects authed users to `/dashboard`; to see
  the landing on local dev, clear the `sb-*-auth-token` localStorage keys for the `127.0.0.1:8080`
  origin only (reversible; prod untouched). `resize_window` may not reflow below the `md`
  breakpoint — true-mobile needs verify-prod / on-device.

## See Also
- [[Landing Redesign & Public Lead Capture]] — the Dark-Luxe base this evolves; the scoped `.dark`
  wrapper + Reveal/MediaSlot/VideoSlot primitives + `leads`/`capture-lead` pipeline (all retained).
- [[Landing Prerendered Shell & Performance]] — the perf discipline (shared-observer Reveal,
  reduced-motion, code-split) the redesign preserves.
- [[Anonymous Brief Generator]] — the "See it work" interactive proof section.
- [[Dragon Feed]] — the creator-content discovery surface DragonShare posts also feed; the
  backdrop adapter reads `dragonshare_posts` directly rather than through Dragon Feed's own
  query path.
- [[Trust-Then-Flag Model]] — why the backdrop adapter gates on a paid boost, not "all verified."
- [[QA CI/CD Gate]] — the Preview-points-at-staging split that makes prod-content features like
  the backdrop adapter unverifiable visually on a PR preview.
