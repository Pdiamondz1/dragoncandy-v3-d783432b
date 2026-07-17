# Session — DragonFeed → Hero Backdrop Adapter v1 (2026-07-17)

Branch: `worktree-dc-landing-page-upgrade`. PR #268, merged + LIVE on prod 2026-07-17.
Frontend + one new anon edge fn only; no schema/RLS/migration/secret.
Spec: `docs/superpowers/specs/2026-07-17-dragonfeed-backdrop-adapter-design.md`.
Plan: `docs/superpowers/plans/2026-07-17-dragonfeed-backdrop-adapter.md`.

## Goal

The [[Landing Cinematic Video Redesign]] shipped a **swappable clip-source seam**
(`landingClips.ts`) with a v1 static registry and an explicit forward-looking note: "a future
DragonFeed adapter can back `resolveLandingClip` instead, with zero changes to any consuming
component." This session **builds that adapter** — the public landing hero backdrop now leads
with real **boosted DragonShare video** when any exists, falling back to the curated static
clips otherwise. Video-only, by design (no images, no Ken-Burns for dynamic content).

## What shipped

- **New anon edge fn `supabase/functions/landing-clips/`** (`index.ts` + pure `lib.ts`
  `buildClips`). `verify_jwt=true` — the **platform default**, so there is deliberately **no**
  `config.toml` entry for this function. Service-role read of `dragonshare_posts`, eligibility:
  `status='verified' AND flagged_at IS NULL AND boost_status='boosted' AND content_type IN
  ('video','reel') AND content_file_path IS NOT NULL AND content_file_path ~* '\.(mp4|webm|mov)$'`,
  plus an inner-joined `dragonshare_boosts` row with `status IN ('captured','transferred')`.
  Returns ONLY `{ src, poster? }` (public URLs) — never the row, never any PII. Ordered
  `created_at DESC, id DESC`, over-fetch `limit(20)`, `buildClips` applies the ext-guard +
  de-dupe-by-src + `cap(4)`. Never throws to the client: any failure → `{ clips: [] }`, so the
  hero silently falls back to static. Deployed via the Supabase CLI (`verify_jwt=true`
  confirmed via `list_edge_functions`; a keyless call 401s as expected; boot-check returned 4
  real clips from prod's existing content).
- **Frontend seam:** `src/components/landing/useLandingBackdropPlaylist.ts` (new file — keeps
  `landingClips.ts` pure, no React/supabase imports there). `fetchLandingBackdropClips()` calls
  `supabase.functions.invoke("landing-clips")` and never throws (any error/malformed response →
  `[]`). `useLandingBackdropPlaylist(key)` returns the static `resolveLandingPlaylist(key)`
  immediately (first paint, no flash of empty state), React-Query-fetches the dynamic clips
  once (`staleTime` 5 min, `retry` 1), and merges via a new pure `mergeBackdropPlaylist` in
  `landingClips.ts`: **dynamic leads** (real content first), static backfills so the rotation is
  never thin, de-duped by src, capped at 6. Returns the *same* static array reference when
  there's nothing dynamic or the key isn't eligible (`hero.brand` stays static-only — hidden
  behind `BRAND_ROLE_ENABLED`), so nothing spuriously remounts. Memoized on `[key, dynamic]`.
- **`HeroSection.tsx`** now keys `RotatingBackdrop` on a new pure `playlistSignature(role,
  playlist)` (role + joined `src`s) instead of `key={role}`. **This is load-bearing, not
  cosmetic:** `RotatingBackdrop` tracks its two crossfading `<video>` layers by **array index**,
  so if the dynamic fetch resolves *after* mount and grows/reorders the playlist in place, the
  component would keep rotating through its original index set and never show the new clip. A
  `key={role}`-only remount would also miss a same-length-different-clips swap (role doesn't
  change, length doesn't change, but the content did). The signature-key remount forces a fresh
  `RotatingBackdrop` instance — starting at clip 0 — the moment the merged playlist's actual
  *contents* change.
- **`RotatingBackdrop.tsx` no-stall fix.** The component only ever advanced its rotation on a
  clip's `onEnded` event. An undecodable or unreachable clip (bad codec, 404, corrupt file)
  **never fires `ended`** — it fires `error` instead — so with the dynamic clip now potentially
  leading at index 0, a single bad boosted upload would **freeze the hero on a blank/black
  layer forever**. Fixed by advancing on `onError` too (guarded to the currently-visible layer)
  and by skipping an already-errored *preloaded* clip when it would next become visible (its
  `error` event already fired once and won't re-fire, and it will never fire `ended` either).
  Caught by the **Opus whole-branch review**, not the per-task reviews — the per-task tests
  covered the pure helpers but not this cross-cutting runtime interaction between "dynamic
  clips can now be low-quality user uploads" and "the rotation only knows how to advance on
  success."

## Key decisions / durable gotchas

- **Curation gate = a paid boost, not "all verified."** DragonShare is trust-then-flag (content
  goes live immediately, flagged post-hoc — see [[Trust-Then-Flag Model]]); putting *all*
  verified content on the anonymous, top-of-funnel public landing would be too risky (no human
  review before a stranger's video represents the brand to a cold visitor). Requiring a
  **captured/transferred boost** — i.e., a restaurant paid real money to amplify this specific
  post — is a cheap, structural quality signal that costs nothing extra to check.
- **The feature was NOT latent.** The whole-branch review queried prod directly and found
  **5 eligible boosted rows already existed** (2 `.MOV`/`.mov`, 2 `.mp4`; the newest — and
  therefore leading — clip was a `.MOV`). The assumption "there's probably no boosted video yet
  so this ships inert" was wrong; verify against prod data, don't assume a cold start.
- **`RotatingBackdrop` advances ONLY on success by default — an undecodable/404 clip is a
  first-class failure mode once the source includes real user uploads**, not just curated
  clips. The extension guard in `buildClips` (`\.(mp4|webm|mov)$`) does not fully cover this —
  a `.mov` container can still hold an HEVC-encoded stream Chrome can't decode, and a
  time-of-check/time-of-use gap (the file existed at boost time, later 404s) is always
  possible. `error`-driven advance + skip-already-errored is the general fix, independent of
  the extension check.
- **Vercel PREVIEW builds point at the STAGING Supabase project** (env-var scope split: prod
  scope = prod Supabase, preview scope = staging — see [[QA CI/CD Gate]]). A prod-content
  feature like this literally cannot be end-to-end visually verified on a PR preview, because
  the preview's `landing-clips` reads staging's (empty) `dragonshare_posts`. Verification split
  three ways instead: the edge fn's own prod boot-check (returns real clips), unit tests against
  the pure helpers, and firing a synthetic `error` event on the real preview bundle to prove the
  no-stall fix client-side. True end-to-end visual proof (does the hero actually show the real
  boosted clip logged-out) is **inherently post-merge on prod** — the founder needs to view it
  logged-out (an authenticated session redirects prod `/` → `/auth`, so there is no way to drive
  this by simply loading dragoncandy.io in an authenticated browser).
- **"Supabase Preview" CI check activates (stops silently "skipping") whenever a PR touches
  `supabase/`.** It can fail with `cancelled` / "Maximum concurrent branches reached" (a backlog
  of stale preview DB branches from other open PRs) — this is a capacity/cleanup problem, not a
  code defect, and it is **not a required check** (only `verify` + `smoke` gate the merge), so
  it does not block landing this PR.
- **`content_file_path` is a full public URL that embeds the creator's `auth.users.id` as its
  first path segment.** Acceptable here (the storage bucket is public and the content is
  boosted/public by definition), but the edge fn returns *only* that URL string — never any
  other row field — so no additional identity or engagement data leaks through this endpoint.

## Process

Brainstorm → spec (2 independent review passes) → plan (reviewed) → subagent-driven execution
(6 tasks, per-task spec + quality review) → **Opus whole-branch review** (caught + the branch
fixed the no-stall gap — commit `649b3985`) → `edge-function-reviewer` subagent PASS on
`landing-clips/index.ts` → **Codex second review clean** → `careful`-gated deploy (CLI,
`verify_jwt=true` preserved, boot-checked against prod) → merged (`1c0d688f`) → prod-live.

## See Also
- [[Landing Cinematic Video Redesign]] — the page whose "future DragonFeed adapter" prediction
  this session closes.
- [[Dragon Feed]] — the creator-content surface the boosted video is drawn from (DragonShare
  posts + boosts, not the Dragon Feed grid itself — this session reads `dragonshare_posts`
  directly, not through Dragon Feed's own query path).
- [[Trust-Then-Flag Model]] — why "verified" alone isn't a strong enough gate for anonymous
  top-of-funnel exposure, and why the boost requirement substitutes for it here.
- [[QA CI/CD Gate]] — the Preview-points-at-staging env-var split that makes this class of
  feature unverifiable pre-merge on a PR preview.
