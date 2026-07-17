# Landing Video Backdrop — Clip Production Kit

> How to produce, host, and wire the cinematic AI-video backdrops for the public landing
> (`src/components/landing/*`). The code seam already ships; this is the founder-run
> production guide. Concept: [[Landing Cinematic Video Redesign]].

## The goal

The hero is a full-bleed, morphing, **per-role** backdrop. Tapping a pill (Business / Creator /
Brand) re-films the hero — headline **and** backdrop clip change together. Until real clips exist,
each slot degrades to a branded gradient (ship-before-clips). Your job: generate 2–3 short silent
loops, drop them behind a CDN, and paste the URLs into one file.

## Which slots are actually rendered

`HeroSection` is the **only** consumer of a clip (`useLandingClip(content.clipKey)` → the
full-bleed `VideoSlot variant="backdrop"`). The keys map like this:

| Clip key | Where it shows | Priority |
|---|---|---|
| `hero.business` | Business pill (the default hero) | **Produce now** |
| `hero.creator` | Creator pill | **Produce now** |
| `hero.brand` | Brand pill — **hidden** behind `BRAND_ROLE_ENABLED` (off) | Produce when Brand launches |
| `proof.reel` | **Nothing** — reserved key, no component renders it | Skip (don't produce) |

So the immediate deliverable is **two clips** (business + creator). Brand is a ready-when-you-flip-the-flag bonus.

## Universal specs (the non-negotiables)

These clips sit **behind a dark gradient scrim** and under the headline/CTAs, so they can be
heavily compressed and still look great. Every clip:

- **Format:** MP4, H.264 (High/Main profile), **`yuv420p` pixel format** — required for inline
  autoplay on iOS/Safari. (A non-`yuv420p` MP4 silently won't play on iPhone.)
- **Resolution:** 1920×1080 (16:9). No larger — weight matters more than pixels here.
- **Frame rate:** 24 or 30 fps.
- **Duration:** ~6s (4–8), designed to **loop seamlessly** (first frame ≈ last frame; slow
  continuous motion). `<video loop>` hard-restarts — there is no ping-pong, so the motion itself
  must wrap.
- **Audio:** none (strip it — it's muted anyway and wastes bytes).
- **Target size:** **≤ 2.5 MB** per clip. Behind the scrim, CRF 28–30 is invisible.
- **Composition — center-safe:** the backdrop is `object-cover` full-bleed, so on phones (portrait)
  **only the center vertical strip shows**, and the bottom ~40% is darkened by the scrim + covered
  by the headline/CTAs. Put the subject/action **upper-center**; keep important detail off the far
  edges and the very bottom. **No on-screen text** (the headline is the text). Avoid faces
  lip-syncing (uncanny on loop) — hands, bodies, environments, and b-roll energy read best.
- **Motion:** slow push-in / drift / ambient movement (steam, bokeh, fabric, light). No hard cuts,
  no fast pans, nothing that "jumps" at the loop point.
- **Consistency:** keep the same color grade / grain / teal+pink accent across all three so the
  morph between roles feels like one film.

## The pipeline (5 steps per clip)

1. **Still — Nano Banana Pro** (Gemini image). Generate a gorgeous on-brand **16:9** hero still
   (prompts below). The still is the foundation; iterate here until it's beautiful.
2. **Animate — image-to-video.** Feed the still as the **first frame** into **Veo 3.1** (best
   quality, use for the hero money-shots) or **Kling 2.x / Runway Gen-4** (faster/cheaper for
   iterations and the Brand grid). Generate 5–8s with the motion prompt; pick the smoothest,
   most loopable take.
3. **Compress + strip audio — ffmpeg** (command below) → ≤ 2.5 MB, `yuv420p`, no audio.
4. **Poster** — export the first frame (shows instantly + is the reduced-motion fallback).
5. **Host + wire** — drop the `.mp4` + poster into `public/landing/`, add the URLs to
   `landingClips.ts`, ship.

### ffmpeg — compress + strip audio

```bash
ffmpeg -i raw-business.mp4 -an \
  -vf "scale=1920:-2,format=yuv420p" \
  -c:v libx264 -profile:v high -crf 28 -preset slow \
  -movflags +faststart \
  hero-business.mp4
```

- `-an` strips audio · `format=yuv420p` = iOS-safe · `+faststart` = the video starts before it
  fully downloads. If a clip is still > 2.5 MB, raise CRF to 30 or cap the bitrate:
  `-maxrate 2.5M -bufsize 5M`.

### ffmpeg — poster still

```bash
ffmpeg -i hero-business.mp4 -frames:v 1 -q:v 3 hero-business-poster.jpg
```

(Optionally convert to `.webp` for a smaller file.)

## Hosting — direct MP4 (chosen path)

For 4–8s silent loops, a single MP4 over a CDN beats HLS/Cloudflare Stream (which only Safari plays
natively — everywhere else needs a player lib). Two options, simplest first:

- **`public/` (recommended to start — zero setup).** Vercel serves `public/` at the site root over
  its CDN, exactly like `/logo.webp`. Put files here:
  ```
  public/landing/hero-business.mp4
  public/landing/hero-business-poster.jpg
  public/landing/hero-creator.mp4
  public/landing/hero-creator-poster.jpg
  ```
  → URLs are `/landing/hero-business.mp4`, etc. No account, no CORS, no code beyond the wiring.
- **Cloudflare R2 (upgrade path).** When the library grows (or DragonFeed supplies real creator
  clips), move the files to a public R2 bucket / custom domain and just change the URLs in
  `landingClips.ts`. The seam doesn't care where the bytes live.

## Wiring — the one file to edit

`src/components/landing/landingClips.ts`. Fill the `src`/`poster` for the slots you've produced:

```ts
export const LANDING_CLIPS: Record<LandingClipKey, LandingClip> = {
  "hero.business": {
    src: "/landing/hero-business.mp4",
    poster: "/landing/hero-business-poster.jpg",
  },
  "hero.creator": {
    src: "/landing/hero-creator.mp4",
    poster: "/landing/hero-creator-poster.jpg",
  },
  "hero.brand": {}, // fill when Brand launches (BRAND_ROLE_ENABLED)
  "proof.reel": {}, // reserved — not rendered; leave empty
};
```

A slot left `{}` keeps its gradient fallback — so you can ship business + creator now and add brand
later with no other change.

## Per-slot creative briefs + copy-paste prompts

Brand palette to keep in every prompt: **teal `#4DD9C0`, pink `#F9A8D4`/`#EC4899`, charcoal
`#1A1A2A`**, warm neutrals. Overall vibe: **Dark-Luxe cinematic** — moody lighting, shallow depth of
field, filmic grade, premium.

### 1 · `hero.business` — headline "Your business, always *filming.*"

**Concept:** a local business made cinematic, with a creator's phone capturing it — "your business
looks incredible on camera, effortlessly."

**Still (Nano Banana Pro, 16:9):**
> Cinematic dark-luxe editorial photograph, 16:9. A cozy local restaurant at golden hour: a chef's
> hands plating a vibrant, colorful dish under warm key light, rich shallow depth of field, moody
> charcoal (#1A1A2A) background falling into shadow. In the soft-focus foreground, a smartphone on a
> small gimbal films the plate, its screen faintly glowing. Subtle teal (#4DD9C0) rim light and warm
> amber highlights, filmic color grade, fine grain, premium food-cinematography look. Subject
> centered. No text, no logos, no watermarks.

**Motion (image-to-video, ~6s seamless loop):**
> Slow, smooth cinematic push-in toward the plated dish. Thin wisps of steam rise gently and
> continuously. The phone screen softly glows; a subtle rack-focus breathes between the phone and the
> food. No camera shake, no cuts. Loops seamlessly — ends where it began.

### 2 · `hero.creator` — headline "Get paid to make content you *love.*"

**Concept:** a creator in flow, filming in a moody urban café — aspirational, confident, creative energy.

**Still (Nano Banana Pro, 16:9):**
> Cinematic dark-luxe editorial portrait, 16:9. A stylish young content creator holds a smartphone on
> a gimbal, framing a shot in a moody, dimly lit urban café at night. Neon teal (#4DD9C0) and pink
> (#EC4899) rim lighting sculpts their profile; warm bokeh city lights blur behind through a window.
> Shallow depth of field, premium film grade, subtle grain, confident creative energy. Subject
> centered. No text, no logos, no watermarks.

**Motion (image-to-video, ~6s seamless loop):**
> The creator slowly raises the phone to compose a shot — a gentle, natural handheld drift. Bokeh
> lights twinkle and shift softly behind them; a light breeze moves a strand of hair and some fabric.
> Warm and cinematic, no hard cuts. Seamless 6-second loop.

### 3 · `hero.brand` — headline "Campaigns that scale *themselves.*" (produce when Brand launches)

**Concept:** many creators / a glowing grid of vertical content — scale, network, momentum.

**Still (Nano Banana Pro, 16:9):**
> Cinematic dark-luxe tech-editorial visual, 16:9. A floating, staggered grid of glowing vertical
> smartphone screens showing diverse, colorful short-form video (abstract, no readable text),
> receding into soft bokeh. Teal (#4DD9C0) and pink (#EC4899) accent glow reflecting off dark glass,
> deep charcoal (#1A1A2A) background, premium depth of field — front screens sharp, back screens
> blurred. Centered composition. No readable text, no logos, no watermarks.

**Motion (image-to-video, ~6s seamless loop):**
> The grid of phone screens slowly parallax-drifts upward, front and back layers moving at different
> speeds. Screens softly flicker as content changes; the teal/pink glow gently pulses. Smooth,
> hypnotic, cinematic. Seamless loop — the upward drift wraps continuously.

## QA checklist (before/after wiring)

- [ ] **Desktop + mobile (portrait):** subject visible in the center strip; headline legible over the scrim.
- [ ] **Weight:** each clip ≤ ~2.5 MB (DevTools → Network).
- [ ] **Loop seam** isn't jarring (watch it loop 3–4×).
- [ ] **iOS/Safari:** actually autoplays inline (confirms `yuv420p`).
- [ ] **Reduced-motion:** with OS "Reduce motion" on, the **poster** shows and it does not autoplay.
- [ ] **Poster-first:** throttle the network — the poster should paint before the video loads.
- [ ] **No console errors**; no layout shift.

## Cost / tooling note

Nano Banana Pro (stills), Veo 3.1 (hero motion), Kling / Runway (volume) are external,
per-generation costs — a few dollars across a handful of takes per slot. This is **creative/serving
spend, not runtime AI spend**, so it does **not** count against the 15%-of-revenue AI kill-switch
(that governs Donny/OpenAI runtime calls via `donny_cost_ledger`).

## See also

- `docs/wiki/concepts/landing-cinematic-video-redesign.md` — the seam + VideoSlot backdrop variant.
- `src/components/landing/landingClips.ts` — the registry you edit.
- `src/components/landing/VideoSlot.tsx` — the hardened backdrop player (poster-first, IO-gated,
  reduced-motion safe).
