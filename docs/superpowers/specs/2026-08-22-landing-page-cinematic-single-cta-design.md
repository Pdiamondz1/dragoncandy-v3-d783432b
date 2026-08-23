# Landing page — cinematic single-CTA rebuild

**Date:** 2026-08-22
**Status:** Design approved, not implemented
**Scope:** `src/pages/LandingPage.tsx`, `src/components/landing/**`, `public/landing/**`
**Routes affected:** `/`, `/home`, `/landing` (all three render `LandingPage`)

---

## 1. What we are building

The public landing page becomes **one screen**. Real restaurant reels play full-bleed behind
everything. Over them sit the logo, one eyebrow, one slogan, and one button. Below the video is a
thin white footer. There is nothing else, and the page does not scroll.

Today's page is roughly 4,100px tall across six sections. It becomes a single viewport.

**The finished page, top to bottom:**

| Element | Content |
|---|---|
| Backdrop | Ten real reels, rotating with a crossfade, full-bleed, muted |
| Header (over video) | `logo.webp` top-left · **Log in** top-right |
| Eyebrow | `People-Driven · Donny-Assisted` |
| Slogan | **Where Restaurants & Creators build content together.** |
| CTA | One pink pill — **Get started** → `/auth?mode=signup` |
| Footer (white) | `© 2026 Dragon Candy LLC · Hoboken, NJ` · Terms · Privacy · Help |

Copy is final and founder-authored. Do not rewrite it during implementation.

### Typographic treatment

The slogan is white except for two accented words: **Restaurants** and **Creators**.

Use **lighter tints than the app's brand values** — `landing-pink` (`#F43F7F`) and `landing-mint`
(`#2FC796`) do not hold up as text over moving footage. Use `#F9BFD6` (`landing-pink-line`) and a
mint at roughly `#7BE3C0`. If the mint tint is not already a token, add it as an additive
`landing-*` token rather than hardcoding a hex in the component (`DESIGN_SYSTEM.md` forbids
hardcoded hex in components).

The eyebrow is `rgba(255,255,255,.65)`-equivalent white, not pink — pink at that size over video
loses legibility.

---

## 2. Decisions, and what they rule out

Recorded so implementation does not silently re-open them.

**One CTA, no role split.** The two doors (business/creator) are deleted. The role question moves
into signup, which already handles it: `AuthPage` renders a `role-selection` step whenever no
`?role=` is passed (`src/pages/AuthPage.tsx:35`). Nothing new needs building for this — verify the
step still renders before deleting the doors, then delete them.

**The backdrop returns as a backdrop.** The reels are 720×1280 portrait. Using them as a wide hero
background costs most of the frame on desktop. This was raised, understood, and chosen. The
mitigation is §4's per-clip crop window, not a change of approach.

**Two encodes per clip, not one.** Portrait for portrait viewports, a 16:9 crop for landscape ones.
On a page that is entirely video, the video being right on both screens justifies the extra ~17 MB.

**Curated clips only.** `useLandingBackdropPlaylist` — which merges boosted DragonShare uploads into
the backdrop — is deleted. An unpredictable user upload should not rotate onto a full-bleed
homepage.

**The feature flag is deleted, not flipped.** `LANDING_VIDEO_BACKDROP_ENABLED` currently gates the
video. Once the video *is* the page, a false value ships a blank homepage. That is not a kill
switch. The genuine fallback already lives inside `RotatingBackdrop`: no clips, failed clips, or
`prefers-reduced-motion` all degrade to a poster still, and the page still works.

**The new tagline lives on the hero only.** `People-Driven · Donny-Assisted` differs from the
company's stated `Human-driven. AI-assisted.`, which appears in the footer tagline, the page title
and meta description, the mission in `CLAUDE.md` and `PROJECT_CONTEXT.md`, and the origin story.
Changing a mission statement is not a landing-page change and must not ride along inside one.
**Out of scope for this spec.**

**The contact form is deleted.** Founder decision. `leads` and the `capture-lead` edge function stay
in the repo and stay deployed; they simply become unreachable from the landing page. Signup becomes
the only path in from the front door.

---

## 3. Preconditions (not code)

**Written permission from ABB and Uncle Rocco.** The reels are their businesses' content, owned in
Drive by an external account (`smithcharlie45@gmail.com`). Publishing them on a public marketing
site needs the businesses' sign-off. **This gates go-live, not the build.** Do not merge to `main`
without it, because merging to `main` deploys.

**Founder confirmation on the Drive files being final.** The clips were uploaded 2026-08-20; treat
that folder as the source of truth at download time and record which revision was taken.

---

## 4. The reel pipeline

Source: Google Drive folder `1IxVUMaFJRZbCh5GR9419GluYSfoR04MZ` ("DragonCandy Content"), shared with
the founder's Chrome profile. It is **not** reachable through the Drive MCP connection — the
connected account has no access — so files come down through the browser.

**Inventory (verified 2026-08-22):** ten files, ~37.9 MB total, 720×1280, sampled duration 21s.

| Clip | Size |
|---|---|
| ABB — Birria Burger | 3.9 MB |
| ABB — Bread Pudding | 2.6 MB |
| ABB — Flatbread | 6.9 MB |
| ABB — Montauk Monday | 5.0 MB |
| ABB — Paella | 5.9 MB |
| Uncle Rocco — Brunch | 3.7 MB |
| Uncle Rocco — New Menu Items! | 3.4 MB |
| Uncle Rocco — Pancakes | 969 KB |
| Uncle Rocco — Reopening | 2.9 MB |
| Uncle Rocco — Steak Frites | 2.6 MB |

### Processing

Each clip produces three files:

1. **Portrait** — the clip as shot, re-encoded for the web: H.264, `-movflags +faststart`, audio
   stripped (`-an`). The backdrop is muted, so audio is pure waste.
2. **Wide** — a 16:9 crop. **The crop window is chosen per clip by watching it**, not by a blanket
   centre crop. The subject of these clips is food, and a default centre crop puts ceilings and
   tablecloths on screen instead. Record the chosen `crop=` filter per clip in the commit message so
   the choice is reproducible.
3. **Poster** — a JPG pulled from a representative frame (not frame 0, which is often a blur or a
   hand entering shot). One poster per orientation.

Audio stripping and `faststart` are not optional: `faststart` moves the moov atom to the front so
playback can begin before the file finishes downloading, which is what keeps first paint quick.

### Naming and location

`public/landing/reels/`, kebab-case, business-prefixed:

```
abb-birria.mp4            abb-birria-wide.mp4
abb-birria-poster.jpg     abb-birria-wide-poster.jpg
…
uncle-rocco-steak-frites.mp4   …
```

**Expected total: 30–40 MB committed.** Report the real figure after encoding rather than asserting
this one — if it lands materially above 40 MB, stop and re-tune the encode before committing.

### Removed assets

The ten existing AI clips in `public/landing/` (`hero-business*.mp4`, `hero-creator*.mp4`,
`hero-brand*.mp4` and their posters) are deleted. They are the reason the backdrop was switched off.

---

## 5. Code changes

The video system is **entirely self-contained in `src/components/landing/`** — verified: nothing
outside that directory imports `landingClips`, `RotatingBackdrop`, `VideoSlot`, `MediaSlot`, or
`useLandingBackdropPlaylist`. Deletion is therefore local.

### Kept and modified

**`RotatingBackdrop.tsx`** — keep everything. It already handles crossfade rotation, skipping clips
that fail to decode, a 15s stall watchdog, `prefers-reduced-motion` → static poster, off-screen
pause, and never holding more than two clips in memory. This is the best-tested piece of the old
system and it was written for exactly this job.

Add one capability: **orientation-aware source selection.** `LandingClip` gains optional `wide` and
`widePoster` fields. At mount, and on orientation change, the component resolves each clip to either
its portrait or its wide source via `matchMedia("(orientation: landscape)")`.

Two constraints on that change:

- Sources are assigned **imperatively** (`v.src = …; v.load()`), because swapping a `<source>` child
  does not re-run a `<video>`'s resource selection. The new selection must follow that same path.
- An orientation flip mid-session must **not** restart the rotation from clip 0 or jump the active
  clip back to frame 0. The existing `setLayerSource` already guards against restarting a playing
  clip via its `changed` check; extend that guard to treat a same-clip source swap as a source
  change that preserves `currentTime` where the browser allows it, and accept a single crossfade if
  it does not. Rotating a phone is rare; a visible reset is acceptable, a rotation reset is not.

**`landingClips.ts`** — the registry becomes one flat curated list of ten reels. `LandingClipKey`,
the per-role playlists, `mergeBackdropPlaylist`, and `DYNAMIC_BACKDROP_KEYS` all go: the page no
longer has roles on it, and there is no dynamic source to merge. Keep `playlistSignature` if
`RotatingBackdrop` still needs a stable remount key.

**`Header.tsx`** — keep the logo (`logo.webp`, already an `<img>` at `h-12 lg:h-14`) and **Log in**.
Delete `navLinks` and the mobile `Sheet` that renders them; every entry points at a section that
will no longer exist. The scroll-state logic that fades the bar to frosted white is no longer
meaningful on a page that does not scroll — remove it, and keep the header transparent.

Keep `pt-[env(safe-area-inset-top)]`. It is load-bearing in the native iOS shell and invisible on
the web (`DESIGN_SYSTEM.md`; found on device 2026-08-14).

**`LandingPage.tsx`** — collapses to `<Header />`, the hero, and the footer. Remove the ambient
pink/mint glow wrapper (there is a video there now). Keep the `overflow-x-hidden` reasoning intact
if `sticky` is still in play; if the header stops being sticky, simplify rather than preserve dead
comments.

**Footer** — keep the legal entity line, Terms, Privacy, Help. **Remove Contact** (it anchors
`#join`, which is deleted). The legal entity line must survive: it exists because Apple verifies an
Organization enrolment partly by visiting the company website (PR #439).

### Deleted

Components: `HeroDoors`, `PositioningBand`, `ValuesSection`, `HowItWorks`, `DonnySection`,
`FinalCTASection`, `BriefGeneratorPreview`, `HeroVideoBackdrop`, `useLandingBackdropPlaylist`.

`heroRole.ts` — **already orphaned today.** Nothing imports it but its own test. Delete both.

`Reveal.tsx` — becomes orphaned by this change: its only five consumers are the five sections being
deleted. Delete it once they are gone; confirm with a grep rather than trusting this line.

Also delete `VideoSlot` and `MediaSlot` **if** nothing in the new hero uses them — check before
removing rather than assuming.

Their co-located tests go with them: `PositioningBand.test.tsx`, `ValuesSection.test.tsx`,
`HowItWorks.test.tsx`, `DonnySection.test.tsx`, `FinalCTASection.test.tsx`,
`useLandingBackdropPlaylist.test.tsx`, `heroRole.test.ts`, and `VideoSlot.test.tsx` if its component
goes.

Config: `LANDING_VIDEO_BACKDROP_ENABLED` from `src/lib/featureConfig.ts`.

### A trap to avoid

**`Eyebrow` is shared with the auth flow.** `src/components/auth/RoleSelection.tsx` imports it — the
very screen the single CTA now sends everyone to. The new hero needs a white eyebrow on dark video;
achieving that by restyling `Eyebrow` itself would put white text on the white role-selection screen
and break the first screen after the only button on the homepage. **Pass the colour at the call site
via `className`, exactly as every existing consumer does.** Do not touch `Eyebrow`'s own styles.

### Left alone deliberately

`landing-clips` (edge function) loses its only caller and becomes dead surface. It is deliberately
anonymous, already hardened and origin-pinned (PR #399). **Leave it deployed.** Undeploying is a
separate decision with its own review; note it as a follow-up rather than doing it here.

`generate-anonymous-brief` (edge function) also loses its only caller when `BriefGeneratorPreview`
is deleted (`grep -rln "generate-anonymous-brief" src` returns nothing post-branch). Unlike
`landing-clips`, it is anonymously reachable **and** spends Anthropic tokens per call, so once this
branch ships, 100% of its future traffic is non-user traffic on a surface nobody is watching. It
already has a daily cap and a honeypot, so this is a cost-visibility gap, not an open hole. **Leave
it deployed** for the same reason as `landing-clips` — undeploying is a separate decision with its
own review — but the undeploy decision needs to actually get made rather than forgotten; track it
alongside `landing-clips` as a follow-up.

`leads`, `capture-lead`, `useSubmitLead` — kept in the repo, unreachable from the landing page.

---

## 6. Layout and viewport mechanics

The hero is one viewport tall. Size it with **`dvh`, never `vh`** — the app document never scrolls
(`h-screen` shell plus an inner `overflow-auto` main), so iOS Safari toolbars never collapse and
`vh` exceeds the visible height (`DESIGN_SYSTEM.md`).

The CTA and footer must clear `env(safe-area-inset-bottom)`; the header pays back
`env(safe-area-inset-top)` as it already does.

**Do not place a transform or `will-change: transform` on any ancestor of the hero.**
`PageTransition` is opacity-only by contract precisely because a transform ancestor breaks
`position: fixed` descendants.

**Mobile is the strong surface here, not desktop** — a 720×1280 clip in a 390-wide portrait viewport
is sharper than native and uncropped. Desktop takes the crop. This inverts the usual worry about
this page, and both viewports must still be checked (`DESIGN_SYSTEM.md`: desktop and mobile are
separate targets).

---

## 7. Accessibility and performance

The backdrop is decorative: `aria-hidden`, muted, `playsInline`. It carries no information the
slogan does not.

`prefers-reduced-motion` shows a poster still and fetches no video — already implemented in
`RotatingBackdrop`; verify it survives the orientation change.

Contrast: the slogan sits over moving footage of varying brightness. Keep the existing scrim
gradient approach, and **verify contrast against the brightest frame of the brightest clip**, not
against an average. If the accented mint fails there, darken the scrim rather than the accent.

First paint shows the poster immediately, so the page is never blank while video loads. Only two
clips are ever in memory.

---

## 8. Testing

Update `HeroSection.test.tsx` (or its replacement) to assert: the slogan renders as one string, the
eyebrow renders, exactly **one** CTA exists, and it points at `/auth?mode=signup`.

Update `Header.test.tsx` — it currently asserts the logo `src` is `/logo.webp` (line 51), which
stays true. Remove assertions about nav links.

Extend `RotatingBackdrop.test.tsx` for orientation selection: landscape picks `wide`, portrait picks
the portrait source, an orientation change does not reset the rotation index, and a clip with no
`wide` source falls back to portrait rather than rendering nothing.

Add a `landingClips.test.ts` case asserting every registry entry has a real `src` and a poster —
a missing poster is invisible until someone loads the page on a slow connection.

Note the known local hazard: Node 26 shadows jsdom's `localStorage` and breaks ~50 tests that CI
passes. Do not chase those if they appear; they are unrelated (`PROJECT_CONTEXT.md` §5).

---

## 9. Documentation to update in the same PR

**`docs/DESIGN_SYSTEM.md`** — currently states as a rule that the public landing is light and shares
one visual identity with login and onboarding. That becomes false. Rewrite that section to say the
landing is dark and video-led, that login/onboarding remain light on the `landing-*` token system,
and that the seam between them is known and accepted.

**`docs/runbooks/landing-video-backdrop-kit.md`** — rewrite for the real pipeline: Drive source, the
two-encode ffmpeg recipe, per-clip crop windows, naming, and where the files live.

**`docs/PROJECT_CONTEXT.md`** §5 — one index line, per the repo's own rule that prose belongs in
`SHIPPED_LOG.md`.

Per `CLAUDE.md`, the knowledge layer is part of finishing the branch: run `knowledge-sync`, write
the wiki session source, ingest it, and prepend the full entry to `docs/SHIPPED_LOG.md`.

---

## 10. Known costs, accepted

**Search.** The page drops from roughly 600 indexable words to about ten. Organic ranking for
dragoncandy.com will fall. Mitigation lives outside this scope: help articles and the Dezzy SEO
posts carry indexable text on their own URLs. The `SEO` component still emits title, description,
canonical and `og:` tags, so the page remains correctly *described* even though it is nearly
wordless.

**A visible seam at signup.** "Get started" moves the visitor from a dark cinematic screen to a
white form. Not fixed here. If it grates in practice, the fix is a darker `AuthShell`, which is its
own piece of work.

**Repo weight.** 30–40 MB of video committed to git. Acceptable at this size; if the library grows
past this, move to Supabase Storage or a CDN behind the same `landingClips` seam, which exists
precisely so the source can change without touching consumers.

---

## 11. Verification before calling it done

1. `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`.
2. Local check at both viewports: video plays, rotates, crossfades, and the correct orientation
   source is chosen in each.
3. Reduced-motion check: poster only, no video request in the network panel.
4. Confirm signup lands on the role-selection step from the single CTA.
5. Codex second review (`codex review --base main`) — mandatory before the PR.
6. Permission from ABB and Uncle Rocco **in hand** before merging to `main`.
7. After deploy, `verify-prod`: both viewports on dragoncandy.com, console clean, video playing.

---

## 12. Out of scope

Darkening login/onboarding · changing the mission statement anywhere outside the hero · SEO recovery
work · undeploying `landing-clips` · a proof/testimonial surface · sourcing landscape footage ·
re-adding any deleted section.
