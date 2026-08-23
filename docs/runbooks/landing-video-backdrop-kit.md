# Landing Video Backdrop — Reel Production Kit

> How to produce the reels behind the public landing's hero (`src/components/landing/*`). The
> landing is now **one dark, full-bleed video screen** — ten real restaurant reels rotating behind
> a logo, an eyebrow, a slogan and a single CTA, not a page you scroll. This replaces the earlier
> flag-gated, per-role, AI-generated hero system this file used to document; that system's history
> lives in [[Landing Cinematic Video Redesign]] (superseded). Design rationale for the current dark
> theme: `docs/DESIGN_SYSTEM.md`'s Theme section.

## The goal

`LandingHero` renders `RotatingBackdrop` unconditionally, full-bleed, behind the eyebrow/headline/
CTA. There is no flag anymore — `LANDING_VIDEO_BACKDROP_ENABLED` is **deleted**, not turned off,
because with the video as the entire page an "off" state would ship a blank homepage. Your job when
the reel library needs to grow or change: pull the source clips, encode each one to the two sizes
`RotatingBackdrop` consumes, and land them under the naming contract `landingClips.ts` expects.

**Current library (shipped, unmerged — see Provenance below): ten clips, five from ABB, five from
Uncle Rocco, alternating in rotation order** so five clips from one business in a row never reads
as that business's solo showreel. `LANDING_REELS` in `src/components/landing/landingClips.ts` is
the registry; add a slug there when you add a clip here.

## Source — Google Drive, not reachable through the Drive MCP connection

Source: Google Drive folder `1IxVUMaFJRZbCh5GR9419GluYSfoR04MZ` ("DragonCandy Content"), shared
with the founder's Chrome profile. **It is not reachable through the Drive MCP connection — the
connected account has no access to this folder.** Files have to come down through the browser:

1. `tabs_context_mcp` → `navigate` to `https://drive.google.com/drive/folders/1IxVUMaFJRZbCh5GR9419GluYSfoR04MZ`
2. Select every file you need (click the first row, then `cmd+a`)
3. Download — Drive delivers a `.zip` for a multi-file selection
4. Unzip into a scratch directory, never the repo directly
5. Close the tab

Downloading is an action, not a lookup — ask the user's explicit go-ahead first, naming the source
and the size, before pulling anything down. The 2026-08-22 batch was ten files, ~37.9 MB, all
720×1280 H.264 with audio, durations ranging 6.87s–33.53s.

## The two-encode recipe

Every clip produces **four files**: a portrait (as-shot) MP4 + poster, and a wide (16:9-cropped)
MP4 + poster. `$SRC` is the downloaded source, `$SLUG` the naming-contract slug (below), `$Y` the
per-clip crop offset, `$TS`/`$TD` an optional trim start/duration (only needed if the source runs
over 12s — see the cap below), and `$PT` the chosen poster timestamp:

```bash
OUT=public/landing/reels

# Portrait — as shot, audio stripped, web-optimised. Add -ss $TS -t $TD before -c:v if trimming.
ffmpeg -y -i "$SRC" -an [-ss $TS -t $TD] \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/$SLUG.mp4"

# Wide — 16:9 crop at the chosen Y offset, same trim window, native 720 width (no upscale — the
# source only has 720 columns of pixels either way).
ffmpeg -y -i "$SRC" -an [-ss $TS -t $TD] -vf "crop=720:405:0:$Y" \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/$SLUG-wide.mp4"

# Posters — a representative second per encode, chosen per clip (see below), never a blind default.
ffmpeg -y -ss $PT -i "$OUT/$SLUG.mp4"      -frames:v 1 -q:v 4 "$OUT/$SLUG-poster.jpg"
ffmpeg -y -ss $PT -i "$OUT/$SLUG-wide.mp4" -frames:v 1 -q:v 4 "$OUT/$SLUG-wide-poster.jpg"
```

**`crf 24` is the starting point, not a fixed value** — the 2026-08-22 batch measured ~42.9 MB at
`crf 24` (over the 40 MB ceiling below) and was re-tuned to `crf 26` for the whole batch, landing
at 38 MB. Re-tune the same way if a future batch runs over.

**Known dimension quirk:** `crop=720:405:0:$Y` asks for height 405, which is odd. `-pix_fmt
yuv420p` requires 4:2:0 chroma subsampling, which requires even width and height, so libx264
silently rounds the crop down to **720×404**. This is not a bug and nothing reads the exact pixel
count — it's the unavoidable intersection of `1280 × 9/16 = 405` (odd) and the also-mandatory
`yuv420p`. Confirmed by direct `ffprobe` on every wide output in the 2026-08-22 batch.

### Why the three flags are load-bearing, not optional

- **`-an`** strips audio. The backdrop is `muted` in the DOM regardless, so any audio track in the
  file is pure transferred weight with zero payback — bytes the visitor's connection pays for and
  never hears.
- **`-pix_fmt yuv420p`** is required for Safari to decode the file **at all**. A non-`yuv420p` MP4
  doesn't degrade gracefully on iOS/Safari — it silently fails to play, and on a page whose entire
  content is video, that's a blank hero for every iPhone visitor.
- **`-movflags +faststart`** moves the `moov` atom (the file's index) to the front of the file, so
  the browser can begin playback before the download finishes. Without it, playback waits for the
  whole file — the difference between the hero painting immediately and the hero sitting on its
  poster for however long the download takes.

## The 12-second cap — and why it exists

**Every reel in the library must be ≤ 12.000s.** This isn't a stylistic choice — it comes from
`RotatingBackdrop`'s own stall watchdog:

```
const MAX_DWELL_MS = 15000; // src/components/landing/RotatingBackdrop.tsx
```

`RotatingBackdrop` force-advances whichever clip is on screen if it neither fires `ended` nor
`error` within 15 seconds. That watchdog exists to stop an undecodable-but-silent clip (or a
mid-play network stall) from freezing the rotation forever — its own comment states it's sized to
comfortably outlast a normal ~6–10s backdrop clip so it never cuts a *healthy* clip short. It is a
**stall backstop, not a pacer**.

The 2026-08-22 source library broke that assumption: six of the ten raw clips ran longer than 15s
(up to 33.53s), which would trip the watchdog mid-play and read as a stutter, not a clean cut. The
fix was to trim every reel to a hand-picked ≤ 12s window during encoding — chosen alongside the
crop offset, not by taking a blind first-12-seconds slice — rather than touch the watchdog's
timing or well-tested code. Clips already at or under 12s are encoded whole with no trim flags.

**Verify the cap, don't assume it.** A prior pass in this same batch shipped a clip at 12.066s
because its 12.07s source duration was mis-classified as "already under the cap"; the fix was
re-encoding with an explicit `-t 12` (see commit `21caeaf8`). `ffprobe`-check every output's
duration before committing — see Verification below.

## Choosing the crop offset, trim window, and poster — judgement, not mechanics

**This step cannot be automated or defaulted.** A 720×1280 portrait clip cropped to 16:9 keeps
only `720×404` — less than a third of the original frame — and a blanket centre crop (`y=437`) on
food-focused footage routinely puts ceilings and tablecloths on screen instead of the food. Food
framed low in the source often wants `y≈550`; a face, hands, or a storefront sign held high often
wants `y≈300`.

The only reliable method: **extract stills from the source every ~2 seconds and look at every one**
before choosing anything. That's what surfaced, in the 2026-08-22 batch:

- `abb-flatbread` and `abb-montauk-monday` both open with several seconds of non-food footage (a
  chef talking to camera over dough prep; ocean/surf B-roll) — invisible unless you actually watch
  the opening seconds, and both crops now skip that footage entirely via the trim window.
- `uncle-rocco-new-menu` opens with an unrelated meme/car-crash clip stitched into the source file
  itself — not introduced by anything in this pipeline, but invisible without watching frame by
  frame.
- `uncle-rocco-reopening`'s source has **no food shots anywhere in it** — it's the storefront
  reopening (staff, the awning, the neon OPEN sign). Its crop (`y=300`) was chosen to keep the sign
  and staff in frame rather than defaulting to a centre crop that would show mid-torso and nothing
  else.

Posters need the same treatment. Generate the whole batch at a default timestamp first (e.g.
`-ss 3`), then **read every single poster** — don't ship the default blind. In the same batch, four
of twenty posters landed on a weak or wrong frame (a dim wide shot, a blurry mid-transition frame,
an ocean-water B-roll cutaway with no food or people in it, and — for `uncle-rocco-new-menu` — a
frame still inside the stitched-in meme clip) and were moved to a stronger timestamp found by the
same still-by-still read. The poster is the first thing every visitor sees, including everyone on
a throttled connection who never gets past it.

**Record every choice in the commit message** — slug, source duration, trim window, crop `y`, the
poster timestamp (only if moved off the default), and a one-line *why*. This is a judgement call
someone else will need to reproduce or extend; see commit `9c838050` (and its follow-up correction
`21caeaf8`) for the format actually used.

## Naming and location contract

`public/landing/reels/`, kebab-case, business-prefixed. **The ten slugs below are the contract —
`LANDING_REELS` in `src/components/landing/landingClips.ts` hardcodes them; a slug change here
means a matching change there.**

| Slug | Source clip |
|---|---|
| `abb-birria` | ABB — Birria Burger |
| `abb-bread-pudding` | ABB — Bread Pudding |
| `abb-flatbread` | ABB — Flatbread |
| `abb-montauk-monday` | ABB — Montauk Monday |
| `abb-paella` | ABB — Paella |
| `uncle-rocco-brunch` | Uncle Rocco — Brunch |
| `uncle-rocco-new-menu` | Uncle Rocco — New Menu Items! |
| `uncle-rocco-pancakes` | Uncle Rocco — Pancakes |
| `uncle-rocco-reopening` | Uncle Rocco — Reopening |
| `uncle-rocco-steak-frites` | Uncle Rocco — Steak Frites |

Four files per slug:

```
public/landing/reels/abb-birria.mp4              public/landing/reels/abb-birria-wide.mp4
public/landing/reels/abb-birria-poster.jpg        public/landing/reels/abb-birria-wide-poster.jpg
…
```

10 slugs × 4 files = **40 files total**. The registry's `reel(slug)` helper builds all four paths
from the slug alone — adding a new clip means adding one `reel("new-slug")` call to `LANDING_REELS`
once its four files exist under that name; nothing else in the naming scheme is configurable.

## The 40 MB ceiling

**Expected total: 30–40 MB, committed to the repo.** This is the entire homepage's payload — it
ships to every visitor who lands on `/`. Report the real measured total after encoding; don't
restate the target as if it were the result. The 2026-08-22 library measured **38 MB (38,944 KB)**
at `crf 26` after the `crf 24` first pass came in at ~42.9 MB, over the ceiling.

**If a future batch exceeds 40 MB, stop and re-tune (`-crf 26`, or higher) before committing.**
Re-encoding one clip at a time and re-checking `du -sh` is cheaper than shipping an oversized
homepage.

## Verification

```bash
cd public/landing/reels
for f in *.mp4; do
  printf '%s\t' "$f"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"
  ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$f" \
    | grep -q audio && echo "  !! AUDIO PRESENT" || true
done
du -sh .
ls *.jpg | wc -l
```

Expected: 10 files at `720,1280` (portrait), 10 at `720,404` (wide — see the dimension quirk
above), **every duration ≤ 12.000000**, no audio warnings, 20 posters, 30–40 MB total.

## Provenance — what gates this going live

The reels are real footage of two real Hoboken-area restaurants, ABB and Uncle Rocco, owned in
Google Drive by an external account (`smithcharlie45@gmail.com`), not DragonCandy. **Publishing
them on a public marketing site needs written permission from both businesses.** That gates
merging `feat/landing-cinematic-single-cta` to `main` (which deploys), not the encode or the build
— the pipeline above is safe to run and iterate on regardless of where that permission stands.
**As of this writing, that permission has not been obtained and the branch is unmerged.** Do not
treat anything in this file as evidence the reels are live.

## See also

- `docs/DESIGN_SYSTEM.md` — Theme section, for why the landing is dark and how the seam into the
  (light) signup flow is deliberate.
- `docs/PROJECT_CONTEXT.md` §5 — current status of the branch and the permission blocker.
- [[Landing Cinematic Video Redesign]] — the superseded flag-gated, per-role, AI-generated hero
  system this replaced; historical context only.
- `src/components/landing/landingClips.ts` — the registry (`LANDING_REELS`, the `reel()` helper,
  `resolveReelSource`).
- `src/components/landing/RotatingBackdrop.tsx` — the player: crossfading rotation, the
  `MAX_DWELL_MS` stall watchdog, the reduced-motion/no-clips poster fallback.
