# Session — Landing Hero Backdrop: HEVC `.MOV` Freeze Fix (2026-07-17)

Branch: `worktree-dc-landing-page-upgrade`. PR #273, merged + LIVE on prod 2026-07-17.
Follow-up to [[DragonFeed Backdrop Adapter Session]] (PR #268, shipped one day earlier).
Frontend + one edge fn (`landing-clips/lib.ts`) redeploy only; no schema/RLS/migration/secret.

## Goal

The founder reported: **"the creator side of the landing page shows one looped video."** The
DragonFeed hero backdrop adapter ([[Landing Cinematic Video Redesign]]) had shipped the day
before with real boosted DragonShare video leading the rotation — this session root-caused why
it was showing one frozen/looping clip instead of rotating through the full playlist, and fixed
the underlying class of bug, not just the symptom.

## Root cause (systematic debugging + probing the actual prod clips)

The **leading** boosted DragonShare clip on prod (the newest boosted row, per PR #268's own
`created_at DESC` ordering) was a real **HEVC (H.265, codec_tag `hvc1`) `.MOV`, 1920×1080** —
a codec Chrome and Firefox cannot decode (Safari-only). Two more of the boosted rows were also
problematic: a portrait `.mov` (1288×2584) and a low-res `.mp4` (640×352). Because
`mergeBackdropPlaylist` put dynamic (boosted) clips **ahead of** the curated static clips, and
business + creator hero variants share the same boosted pool, **both** landing variants opened
on this same broken clip.

The critical detail that made this worse than a normal "bad clip" case: an HEVC video a browser
can't decode often does **not** fire the `<video>` element's `error` event — it just renders a
silent black/frozen frame. PR #268's `onError`-advance fix (shipped the day before) only
handles clips that are *reachable but explicitly fail* (404, corrupt file); it does nothing for
a clip that decodes to nothing and never complains. That's why the symptom looked like "stuck
on one looped video" rather than "clip skipped and moved on" — the rotation's only recovery path
never triggered.

## What shipped (3 fixes)

1. **Dynamic clips now TRAIL the curated static clips**, not lead them.
   `mergeBackdropPlaylist` (`src/components/landing/landingClips.ts`) changed from
   `[...dynamicClips, ...staticClips]` to `[...staticClips, ...dynamicClips]`. The hero always
   **opens** on a polished, on-brand curated clip; real boosted content still appears later in
   the loop — still delivering the social-proof value PR #268 was going for, just without
   letting an unpredictable, unreviewed user upload be the first thing a cold visitor sees.
2. **Dropped `.mov`/`.MOV` from eligibility.** `buildClips`'s `VIDEO_EXT` regex in
   `supabase/functions/landing-clips/lib.ts` narrowed from `/\.(mp4|webm|mov)$/i` to
   `/\.(mp4|webm)$/i`. A `.mov` from a phone is frequently either undecodable HEVC or a portrait
   capture — neither is a safe bet for a public, anonymous, cross-browser hero backdrop. The
   edge function was redeployed (`landing-clips`, `verify_jwt=true` preserved); it now returns
   only the 2 playable `.mp4` rows from the 5 that exist in prod.
3. **Added a 15s max-dwell watchdog to `RotatingBackdrop`** (`MAX_DWELL_MS = 15000`). A clip that
   neither fires `ended` nor `error` — the exact HEVC-shows-black case, or any other mid-play
   stall — now force-advances after 15 seconds. The watchdog re-arms on every `visible` change
   and is cleared by a normal advance, so a healthy ~6–10s clip never trips it; it's a stall
   backstop, not a pacer. This is the **definitive no-freeze guarantee**, layered on top of
   PR #268's `onError`-advance + already-errored-skip — between the three fixes, the rotation now
   can neither open on nor permanently freeze on a broken clip, regardless of why it's broken.

## Reversed decisions

This session **explicitly reverses two calls made during the PR #268 build**:
- "Keep `.mov` in the extension allow-list" → dropped. It was a reasonable-looking guard at
  build time (a `.mov` container *can* hold clean, decodable content); concrete prod evidence
  (the actual leading clip being real HEVC) proved it insufficient for anonymous public
  playback.
- "Dynamic clips lead the rotation" → flipped to trail. Leading with real content was PR #268's
  whole point (the DragonFeed adapter's value proposition — real social proof, not just curated
  polish), but it directly caused this incident: an unpredictable-quality upload became the
  hero's first impression. Trailing keeps the value without the risk.

Both reversals were made **on concrete evidence** (a specific `hvc1` 1920×1080 `.MOV` identified
as the leading clip), not speculation — the same discipline the [[AI Creator Matching]] and
other bug-fix sessions have used: verify against real data before changing a design decision.

## Reviews

`edge-function-reviewer` PASS on the redeployed `landing-clips/lib.ts`. Codex second review
clean — its one P2 (re-raising `verify_jwt=false` for the edge fn) was a **false positive**:
the dynamic clips had already been reaching the browser under `verify_jwt=true` (that's how the
broken clip was visible in the first place), which is itself proof the anon/`verify_jwt=true`
platform-default access pattern works correctly for a logged-out visitor. 58 landing/edge tests
pass (17 new `RotatingBackdrop` watchdog tests, plus updated `landingClips`/`lib.ts` fixtures for
the new merge order and extension guard).

## Durable lessons

- **A `.mov` file extension is NOT a safe web-video signal.** An iPhone `.mov` is frequently
  HEVC-encoded, which only Safari can decode — gate any public/cross-browser video backdrop to
  `mp4`/`webm` only.
- **Unpredictable user-upload quality is exactly why dynamic/user-sourced clips should TRAIL,
  not LEAD, a polished hero.** The value of showing real content is preserved by including it
  later in a loop; the risk of showing it first is not worth the marginal "freshness" of leading
  with it.
- **A rotation that advances only on `onEnded` needs BOTH an `onError` path AND a max-dwell
  watchdog to truly never freeze.** `onError` alone (PR #268) covers clips that are unreachable
  or explicitly rejected; it does nothing for a clip that "plays" but decodes to nothing and
  never fires an error event. Only a time-based watchdog closes that gap.

## See Also
- [[Landing Cinematic Video Redesign]] — the concept page this session corrects in place (the
  "DragonFeed Backdrop Adapter" section previously described the pre-fix, dynamic-leads/`.mov`-
  eligible/`onError`-only behavior).
- [[DragonFeed Backdrop Adapter Session]] — the PR #268 session this one follows up on and
  partially reverses.
- [[Trust-Then-Flag Model]] — why a paid boost, not "all verified," is the curation gate that
  let an unreviewed `.MOV` reach the landing page in the first place.
- [[Dragon Feed]] — the creator-content surface the boosted video is drawn from.
