# Landing Cinematic Single-CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-section DragonCandy landing page with a single screen — ten real restaurant reels playing full-bleed behind a logo, an eyebrow, a slogan, and one button.

**Architecture:** Reuse `RotatingBackdrop` unchanged in behaviour, adding only orientation-aware source selection so phones get the uncropped 9:16 reel and desktop gets a per-clip 16:9 crop. Build the new hero alongside the old page, switch `LandingPage` over in one task, then delete what is no longer referenced. Every task leaves the tree building, type-checking and testing green.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind, Vitest + @testing-library/react, ffmpeg (encode step only).

**Spec:** `docs/superpowers/specs/2026-08-22-landing-page-cinematic-single-cta-design.md`

**Branch:** `feat/landing-cinematic-single-cta` (already created; the spec is committed on it)

## Global Constraints

- **Copy is founder-authored and final. Do not rewrite it.**
  - Eyebrow: `People-Driven · Donny-Assisted`
  - Slogan: `Where Restaurants & Creators build content together.`
  - CTA label: `Get started` → `/auth?mode=signup`
  - Footer: `© <year> Dragon Candy LLC · Hoboken, NJ` · Terms · Privacy · Help
- **Accent tints are the light ones, not the brand values.** `Restaurants` uses `landing-pink-line` (`#F9BFD6`); `Creators` uses a new `landing-mint-line-bright` token (`#7BE3C0`). The real `landing-pink` / `landing-mint` do not hold up as text over moving footage.
- **Never hardcode a hex in a component** (`DESIGN_SYSTEM.md`). Add tokens to `tailwind.config.ts`.
- **Never restyle `Eyebrow` itself.** `src/components/auth/RoleSelection.tsx` imports it — the exact screen the CTA leads to. Pass colour via `className` at the call site.
- **`dvh`, never `vh`** for the full-height hero; pay back `env(safe-area-inset-top)` on the header and `env(safe-area-inset-bottom)` on bottom-anchored content.
- **No transform (or `will-change: transform`) on any ancestor of the hero** — it breaks `position: fixed` descendants.
- **Do not merge to `main`** until written permission from ABB and Uncle Rocco is in hand. Merging deploys.
- Node 26 shadows jsdom's `localStorage` and breaks ~50 unrelated tests that CI passes. Ignore those if they appear.

---

### Task 1: Install ffmpeg and fetch the ten reels

Raw downloads are working files. They go in the scratchpad and are **never committed**.

**Files:**
- Create: `/private/tmp/claude-501/-Users-dwill-GIT-dragoncandy-v3-d783432b/3fa1f241-e2e4-447b-998e-ea6d39fbc4ad/scratchpad/reels/` (raw downloads)
- Create: `/private/tmp/.../scratchpad/reels/INVENTORY.txt` (ffprobe record)

**Interfaces:**
- Consumes: nothing
- Produces: ten source `.mp4`/`.mov` files on disk and a verified inventory. Task 2 reads them.

- [ ] **Step 1: Ask the user to install ffmpeg**

This is a system-level install; do not run it silently. Ask the user to run:

```bash
brew install ffmpeg
```

- [ ] **Step 2: Verify ffmpeg is present**

Run: `ffmpeg -version && ffprobe -version`
Expected: version banners for both. If either is missing, stop — Task 2 cannot proceed.

- [ ] **Step 3: Ask permission, then download the reels**

Downloading files is an action that needs the user's explicit go-ahead. Ask first, naming the source and size: ten video files, ~37.9 MB total, from the shared Drive folder `1IxVUMaFJRZbCh5GR9419GluYSfoR04MZ` ("DragonCandy Content").

The Drive MCP connection **cannot see this folder** — the connected account has no access. Use Chrome:

1. `tabs_context_mcp` → `navigate` to `https://drive.google.com/drive/folders/1IxVUMaFJRZbCh5GR9419GluYSfoR04MZ`
2. Select all ten files (click the first row, then `cmd+a`)
3. Download — Drive delivers a `.zip` for a multi-file selection
4. Unzip into the scratchpad `reels/` directory
5. Close the tab

- [ ] **Step 4: Verify what actually arrived**

```bash
cd <scratchpad>/reels
for f in *; do
  printf '%s\t' "$f"
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,duration,codec_name \
    -of csv=p=0 "$f"
done | tee INVENTORY.txt
```

Expected: ten rows. Sampled reference (ABB — Birria Burger) is `720,1280,~21,h264`.

**Do not assume all ten match the sample.** Only one was inspected. Record the real width, height, duration and codec for each. A clip that is not 720×1280, or is HEVC rather than H.264, needs its own crop offset and a codec conversion in Task 2 — and an HEVC file is exactly the case `RotatingBackdrop`'s error-skip path exists for.

- [ ] **Step 5: Report the inventory to the user**

State any clip that differs from 720×1280 H.264 before encoding. No commit — nothing here is tracked.

---

### Task 2: Encode the reels into the repo

**Files:**
- Create: `public/landing/reels/*.mp4`, `public/landing/reels/*.jpg` (40 files: 10 clips × portrait + wide + 2 posters)
- Delete: `public/landing/hero-business*.{mp4,jpg}`, `public/landing/hero-creator*.{mp4,jpg}`, `public/landing/hero-brand*.{mp4,jpg}` (the 20 AI-footage files)

**Interfaces:**
- Consumes: Task 1's raw files
- Produces: the exact paths Task 3's registry names. **The slugs below are the contract** — Task 3 hardcodes them.

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

- [ ] **Step 1: Watch each clip and choose its crop window**

Open each raw file and decide where the 16:9 band sits. A 720×1280 clip cropped to 16:9 keeps `720×405` — **less than a third of the frame.** A blanket centre crop (`y=437`) puts ceilings and tablecloths on screen instead of food.

For each clip, record the `y` offset in a table. Centre is `y=437`; food framed low often wants `y≈550`, a face or hands high often wants `y≈300`.

**This step is judgement, not mechanics. Do not skip it and default everything to 437.**

- [ ] **Step 2: Encode portrait + wide + posters**

Per clip, with `$SLUG`, `$SRC` and the chosen `$Y`:

```bash
OUT=public/landing/reels

# Portrait — as shot, audio stripped, web-optimised
ffmpeg -y -i "$SRC" -an \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/$SLUG.mp4"

# Wide — 16:9 crop at the chosen offset, kept at native 720 width
ffmpeg -y -i "$SRC" -an -vf "crop=720:405:0:$Y" \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/$SLUG-wide.mp4"

# Posters — pick a representative second, NOT frame 0
ffmpeg -y -ss 3 -i "$OUT/$SLUG.mp4"      -frames:v 1 -q:v 4 "$OUT/$SLUG-poster.jpg"
ffmpeg -y -ss 3 -i "$OUT/$SLUG-wide.mp4" -frames:v 1 -q:v 4 "$OUT/$SLUG-wide-poster.jpg"
```

Three flags are load-bearing and must not be dropped:
- `-an` strips audio. The backdrop is muted, so audio is pure transferred waste.
- `-pix_fmt yuv420p` is required for Safari to decode at all.
- `-movflags +faststart` moves the moov atom to the front so playback starts before the download finishes.

The wide encode stays at **720×405 native**. Upscaling to 1280×720 adds bytes without adding detail — the source has 720 columns of pixels either way.

If `-ss 3` lands on a blurred or transitional frame, pick a different second for that clip rather than shipping a bad poster. The poster is the first thing every visitor sees.

- [ ] **Step 3: Verify the encodes**

```bash
cd public/landing/reels
for f in *.mp4; do
  printf '%s\t' "$f"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"
  ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$f" \
    | grep -q audio && echo "  !! AUDIO PRESENT" || true
done
du -sh .
ls *.jpg | wc -l
```

Expected: 10 files at `720,1280`, 10 at `720,405`, **no audio warnings**, 20 posters, total 30–40 MB.

**If the total exceeds 40 MB, stop and re-tune** (`-crf 26`) before committing. Report the real figure — do not restate the estimate.

- [ ] **Step 4: Delete the AI clips**

```bash
rm public/landing/hero-business*.mp4 public/landing/hero-business*.jpg
rm public/landing/hero-creator*.mp4 public/landing/hero-creator*.jpg
rm public/landing/hero-brand*.mp4 public/landing/hero-brand*.jpg
ls public/landing/
```

Expected: only the `reels/` directory remains.

- [ ] **Step 5: Commit**

```bash
git add public/landing
git commit -m "assets: real ABB + Uncle Rocco reels replace the AI hero footage

Ten clips, two encodes each (portrait as-shot for phones, a per-clip 16:9
crop for desktop) plus posters. Audio stripped, faststart enabled.

Crop offsets chosen per clip by watching them: <slug>=<y>, ..."
```

Put the real crop offsets in the message. They are a judgement call someone will need to reproduce.

---

### Task 3: Rewrite the clip registry (additive — old exports stay)

`landingClips.ts` keeps its existing exports for now so `HeroSection`, `HeroVideoBackdrop` and `useLandingBackdropPlaylist` still compile. Task 8 removes them.

**Files:**
- Modify: `src/components/landing/landingClips.ts`
- Test: `src/components/landing/landingClips.test.ts`

**Interfaces:**
- Consumes: Task 2's file paths
- Produces:
  - `interface LandingReel { src, poster, wide?, widePoster?, business, label }`
  - `const LANDING_REELS: LandingReel[]` (10 entries)
  - `resolveReelSource(reel: LandingReel, isLandscape: boolean): { src: string; poster: string }`

  Task 4 consumes `resolveReelSource`; Task 6 consumes `LANDING_REELS`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/landing/landingClips.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LANDING_REELS, resolveReelSource } from "./landingClips";

describe("LANDING_REELS", () => {
  it("has ten reels, each with a portrait source, poster, business and label", () => {
    expect(LANDING_REELS).toHaveLength(10);
    for (const reel of LANDING_REELS) {
      expect(reel.src).toMatch(/^\/landing\/reels\/[a-z0-9-]+\.mp4$/);
      expect(reel.poster).toMatch(/^\/landing\/reels\/[a-z0-9-]+-poster\.jpg$/);
      expect(["ABB", "Uncle Rocco"]).toContain(reel.business);
      expect(reel.label.length).toBeGreaterThan(0);
    }
  });

  it("points at files that actually exist in public/", () => {
    // A typo in a path is invisible until someone loads the page on a slow
    // connection and gets a black rectangle. Catch it here instead.
    for (const reel of LANDING_REELS) {
      for (const p of [reel.src, reel.poster, reel.wide, reel.widePoster]) {
        if (!p) continue;
        expect(existsSync(join(process.cwd(), "public", p))).toBe(true);
      }
    }
  });
});

describe("resolveReelSource", () => {
  const reel = {
    src: "/landing/reels/a.mp4",
    poster: "/landing/reels/a-poster.jpg",
    wide: "/landing/reels/a-wide.mp4",
    widePoster: "/landing/reels/a-wide-poster.jpg",
    business: "ABB" as const,
    label: "A",
  };

  it("returns the portrait source in portrait", () => {
    expect(resolveReelSource(reel, false)).toEqual({
      src: "/landing/reels/a.mp4",
      poster: "/landing/reels/a-poster.jpg",
    });
  });

  it("returns the wide source in landscape", () => {
    expect(resolveReelSource(reel, true)).toEqual({
      src: "/landing/reels/a-wide.mp4",
      poster: "/landing/reels/a-wide-poster.jpg",
    });
  });

  it("falls back to portrait in landscape when no wide encode exists", () => {
    const { wide: _w, widePoster: _wp, ...noWide } = reel;
    expect(resolveReelSource(noWide, true)).toEqual({
      src: "/landing/reels/a.mp4",
      poster: "/landing/reels/a-poster.jpg",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/landing/landingClips.test.ts`
Expected: FAIL — `LANDING_REELS` and `resolveReelSource` are not exported.

- [ ] **Step 3: Implement**

Add to `src/components/landing/landingClips.ts` (leave everything already in the file untouched):

```ts
/** One curated reel. `src`/`poster` are the as-shot 9:16 files and are always present;
 *  `wide`/`widePoster` are the 16:9 crop for landscape viewports. */
export interface LandingReel {
  src: string;
  poster: string;
  wide?: string;
  widePoster?: string;
  business: "ABB" | "Uncle Rocco";
  label: string;
}

const reel = (slug: string, business: LandingReel["business"], label: string): LandingReel => ({
  src: `/landing/reels/${slug}.mp4`,
  poster: `/landing/reels/${slug}-poster.jpg`,
  wide: `/landing/reels/${slug}-wide.mp4`,
  widePoster: `/landing/reels/${slug}-wide-poster.jpg`,
  business,
  label,
});

/** The landing backdrop playlist, in rotation order. Curated only — no user uploads. */
export const LANDING_REELS: LandingReel[] = [
  reel("abb-birria", "ABB", "Birria Burger"),
  reel("uncle-rocco-steak-frites", "Uncle Rocco", "Steak Frites"),
  reel("abb-paella", "ABB", "Paella"),
  reel("uncle-rocco-brunch", "Uncle Rocco", "Brunch"),
  reel("abb-flatbread", "ABB", "Flatbread"),
  reel("uncle-rocco-new-menu", "Uncle Rocco", "New Menu Items"),
  reel("abb-montauk-monday", "ABB", "Montauk Monday"),
  reel("uncle-rocco-pancakes", "Uncle Rocco", "Pancakes"),
  reel("abb-bread-pudding", "ABB", "Bread Pudding"),
  reel("uncle-rocco-reopening", "Uncle Rocco", "Reopening"),
];

/** Pick the encode that matches the viewport. Falls back to portrait, which always exists. */
export function resolveReelSource(
  clip: LandingReel,
  isLandscape: boolean,
): { src: string; poster: string } {
  if (isLandscape && clip.wide) {
    return { src: clip.wide, poster: clip.widePoster ?? clip.poster };
  }
  return { src: clip.src, poster: clip.poster };
}
```

The parameter is `clip`, not `reel`, on purpose — `reel` is already the name of the factory
helper above it in the same module, and shadowing it would trip `no-shadow` and read badly.

The order alternates the two restaurants deliberately — five ABB clips in a row would read as one business's showreel rather than a marketplace.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/landing/landingClips.test.ts`
Expected: PASS, including the existence check (which requires Task 2 to have committed the files).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landingClips.ts src/components/landing/landingClips.test.ts
git commit -m "feat: curated reel registry with orientation-aware source resolution"
```

---

### Task 4: Teach RotatingBackdrop to pick by orientation

**Files:**
- Create: `src/components/landing/useIsLandscape.ts`
- Modify: `src/components/landing/RotatingBackdrop.tsx`
- Test: `src/components/landing/RotatingBackdrop.test.tsx`

**Interfaces:**
- Consumes: `resolveReelSource`, `LandingReel` (Task 3)
- Produces: `useIsLandscape(): boolean`; `RotatingBackdrop` accepts `playlist: LandingReel[]`

- [ ] **Step 1: Write the orientation hook**

`src/components/landing/useIsLandscape.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * True when the viewport is wider than it is tall. Defaults to FALSE (portrait) when
 * `matchMedia` is unavailable — jsdom and the prerendered shell both lack it, and portrait
 * is the encode that always exists, so the safe default can never resolve to a missing file.
 * Mirrors the defaulting in `usePrefersReducedMotion`.
 */
export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(orientation: landscape)");
    setLandscape(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return landscape;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/components/landing/RotatingBackdrop.test.tsx`. Note the existing `afterEach` already deletes `window.matchMedia`, so these helpers do not leak.

```ts
function mockOrientation(isLandscape: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (
    query: string,
  ) =>
    ({
      // reduced-motion must stay false so the video path renders
      matches: query.includes("orientation") ? isLandscape : false,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

const wideReel = (n: number) => ({
  src: `/landing/reels/r${n}.mp4`,
  poster: `/landing/reels/r${n}-poster.jpg`,
  wide: `/landing/reels/r${n}-wide.mp4`,
  widePoster: `/landing/reels/r${n}-wide-poster.jpg`,
  business: "ABB" as const,
  label: `R${n}`,
});

describe("RotatingBackdrop — orientation", () => {
  it("loads the wide encode in landscape", () => {
    mockOrientation(true);
    render(<RotatingBackdrop playlist={[wideReel(1), wideReel(2)]} />);
    const active = document.querySelector('[data-testid="backdrop-layer-0"]') as HTMLVideoElement;
    expect(active.src).toContain("/landing/reels/r1-wide.mp4");
  });

  it("loads the portrait encode in portrait", () => {
    mockOrientation(false);
    render(<RotatingBackdrop playlist={[wideReel(1), wideReel(2)]} />);
    const active = document.querySelector('[data-testid="backdrop-layer-0"]') as HTMLVideoElement;
    expect(active.src).toContain("/landing/reels/r1.mp4");
    expect(active.src).not.toContain("-wide");
  });

  it("falls back to portrait in landscape when a reel has no wide encode", () => {
    mockOrientation(true);
    const { wide: _w, widePoster: _wp, ...noWide } = wideReel(1);
    render(<RotatingBackdrop playlist={[noWide, wideReel(2)]} />);
    const active = document.querySelector('[data-testid="backdrop-layer-0"]') as HTMLVideoElement;
    expect(active.src).toContain("/landing/reels/r1.mp4");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/landing/RotatingBackdrop.test.tsx -t orientation`
Expected: FAIL — the portrait source loads in every case, because orientation is not consulted yet.

- [ ] **Step 4: Implement**

In `RotatingBackdrop.tsx`:

1. Import `useIsLandscape` and `resolveReelSource`; change the `playlist` prop type to `LandingReel[]`.
2. `const isLandscape = useIsLandscape();` and mirror it into `const landscapeRef = useRef(isLandscape)` kept in sync by an effect, so async handlers never read a stale closure — the same pattern the file already uses for `visibleRef` and `layerClipRef`.
3. In `setLayerSource`, resolve through orientation and **track clip and orientation separately** so an orientation swap does not restart the clip:

```ts
const { src, poster } = resolveReelSource(clip, landscapeRef.current);
const orient = landscapeRef.current ? "w" : "p";
const clipChanged = v.dataset.clip !== String(clipIdx);
const orientChanged = v.dataset.orient !== orient;
if (clipChanged || orientChanged) {
  const resumeAt = orientChanged && !clipChanged ? v.currentTime : 0;
  v.src = src;
  v.poster = poster ?? "";
  v.dataset.clip = String(clipIdx);
  v.dataset.orient = orient;
  v.load();
  // Only a genuine clip change starts from the top. An orientation flip keeps its place.
  v.currentTime = resumeAt;
}
```

4. Add an effect that re-points **both** layers at their current clip indices when orientation changes, leaving `layerClip` and `visible` untouched:

```ts
useEffect(() => {
  landscapeRef.current = isLandscape;
  if (!rotating) return;
  const [c0, c1] = layerClipRef.current;
  setLayerSource(0, c0, visibleRef.current === 0);
  setLayerSource(1, c1, visibleRef.current === 1);
}, [isLandscape, rotating, setLayerSource]);
```

Also resolve through `resolveReelSource` in the reduced-motion `<img>` branch, the `SingleClip` branch, and the declarative `poster={...}` on each `<video>`.

**Do not touch** the crossfade, the `ended`/`error` advance, the stall watchdog, or the IntersectionObserver. They are correct and well tested.

- [ ] **Step 5: Run the full backdrop suite**

Run: `npx vitest run src/components/landing/RotatingBackdrop.test.tsx`
Expected: PASS — the new orientation tests **and** every pre-existing test. A regression here means the rotation broke.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/useIsLandscape.ts src/components/landing/RotatingBackdrop.tsx src/components/landing/RotatingBackdrop.test.tsx
git commit -m "feat: RotatingBackdrop picks the encode that matches the viewport orientation"
```

---

### Task 5: Add the accent token

**Files:**
- Modify: `tailwind.config.ts` (the `landing` colour group, around line 46-63)

**Interfaces:**
- Produces: the `landing-mint-line-bright` Tailwind class, consumed by Task 6

- [ ] **Step 1: Add the token**

Inside the existing `landing: { ... }` group, alongside `'mint-line': '#B8ECDA'`:

```ts
// Brighter than `mint-line`, dimmer than `mint`. The only mint that stays legible as
// TEXT over moving footage — `landing-mint` (#2FC796) vanishes against a lit dish.
'mint-line-bright': '#7BE3C0',
```

Additive only. Do not change any existing value — `landing-mint` is used across the app.

- [ ] **Step 2: Verify the build picks it up**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: landing-mint-line-bright token for text over video"
```

---

### Task 6: Build the new hero

Built standalone. Nothing renders it until Task 7.

**Files:**
- Create: `src/components/landing/LandingHero.tsx`
- Test: `src/components/landing/LandingHero.test.tsx`

**Interfaces:**
- Consumes: `LANDING_REELS` (Task 3), `RotatingBackdrop` (Task 4), `landing-mint-line-bright` (Task 5), existing `Eyebrow` and `LandingButton`
- Produces: `export function LandingHero()`

- [ ] **Step 1: Write the failing test**

`src/components/landing/LandingHero.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("LandingHero", () => {
  it("renders the eyebrow, the slogan as one sentence, and exactly one CTA into signup", async () => {
    vi.doMock("./RotatingBackdrop", () => ({
      RotatingBackdrop: () => <div data-testid="rotating-backdrop" />,
    }));
    const { LandingHero } = await import("./LandingHero");

    render(<LandingHero />);

    expect(screen.getByText("People-Driven · Donny-Assisted")).toBeInTheDocument();

    // The accent spans must not fragment the sentence for a screen reader.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Where Restaurants & Creators build content together.");

    const ctas = screen.getAllByRole("link");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toHaveAttribute("href", "/auth?mode=signup");
    expect(ctas[0]).toHaveTextContent("Get started");
  });

  it("mounts the backdrop", async () => {
    vi.doMock("./RotatingBackdrop", () => ({
      RotatingBackdrop: () => <div data-testid="rotating-backdrop" />,
    }));
    const { LandingHero } = await import("./LandingHero");
    render(<LandingHero />);
    expect(screen.getByTestId("rotating-backdrop")).toBeInTheDocument();
  });
});
```

The `h1.textContent` assertion is the important one. Colouring two words means wrapping them in `<span>`s, and it is easy to introduce stray whitespace that makes the sentence read wrong aloud.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/landing/LandingHero.test.tsx`
Expected: FAIL — `./LandingHero` does not exist.

- [ ] **Step 3: Implement**

`src/components/landing/LandingHero.tsx`:

```tsx
import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";
import { RotatingBackdrop } from "./RotatingBackdrop";
import { LANDING_REELS } from "./landingClips";

/**
 * The whole landing page above the footer: real reels full-bleed, one eyebrow, one slogan,
 * one CTA. `isolate` gives the section its own stacking context so the backdrop's -z-10 paints
 * above the section background rather than behind it.
 *
 * Height is `dvh`, never `vh` — the app document never scrolls, so iOS toolbars never collapse
 * and `vh` overshoots the visible area (DESIGN_SYSTEM.md).
 */
export function LandingHero() {
  return (
    <section className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-landing-grape px-5 text-center sm:px-8">
      <RotatingBackdrop playlist={LANDING_REELS} className="-z-20" />

      {/* Scrim. Darker top and bottom so the header and the CTA stay legible over a bright
          frame; lighter through the middle so the footage still reads as footage. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-landing-grape/70 via-landing-grape/40 to-landing-grape/85"
      />

      <Eyebrow className="text-white/65">People-Driven · Donny-Assisted</Eyebrow>

      <h1 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
        Where <span className="text-landing-pink-line">Restaurants</span> &amp;{" "}
        <span className="text-landing-mint-line-bright">Creators</span> build content together.
      </h1>

      <LandingButton
        variant="pink"
        href="/auth?mode=signup"
        className="mt-9 px-10 py-4 text-lg"
      >
        Get started
      </LandingButton>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/landing/LandingHero.test.tsx`
Expected: PASS. If `h1.textContent` fails on whitespace, fix the JSX spacing — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/LandingHero.tsx src/components/landing/LandingHero.test.tsx
git commit -m "feat: single-screen landing hero over the reel backdrop"
```

---

### Task 7: Switch the page over

After this task the new page is live locally and the old sections are unreferenced.

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/components/landing/Header.tsx`
- Test: `src/components/landing/Header.test.tsx`

**Interfaces:**
- Consumes: `LandingHero` (Task 6)
- Produces: a `LandingPage` rendering only `Header`, `LandingHero`, and the footer

- [ ] **Step 1: Write the failing Header test**

Replace the nav-link assertions in `src/components/landing/Header.test.tsx` with:

```tsx
it("renders the logo and a single Log in link, and no section nav", () => {
  render(<MemoryRouter><Header /></MemoryRouter>);

  const logo = screen.getByAltText("DragonCandy");
  expect(logo.getAttribute("src")).toBe("/logo.webp");

  expect(screen.queryByText("For businesses")).not.toBeInTheDocument();
  expect(screen.queryByText("For creators")).not.toBeInTheDocument();
  expect(screen.queryByText("How it works")).not.toBeInTheDocument();
  expect(screen.queryByText("Meet Donny")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();
});
```

Keep the existing render helper and imports from the file — reuse whatever wrapper it already uses rather than inventing one.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/landing/Header.test.tsx`
Expected: FAIL — the nav links are still rendered.

- [ ] **Step 3: Strip the header**

In `Header.tsx`:
- Delete `navLinks`, `handleNavClick`, `scrollToSection`, the `Sheet`/`SheetContent`/`SheetTrigger` block, the `Menu` import, and the `sheetOpen` state.
- Delete the `scrolled` state and its `useEffect`. The page no longer scrolls, so a scroll-triggered frosted bar can never trigger.
- Keep: the logo `<img>`, the **Log in** action, `sticky top-0 z-50`, and `pt-[env(safe-area-inset-top)]`.
- The bar is permanently transparent now; recolour any dark-on-light text to white so it reads over the video.

**Watch `handleNavigate`.** It is the Log in path and must survive, but its body calls
`setSheetOpen(false)` and defers with a `setTimeout` — both only there to let the mobile sheet close
before routing. With the sheet deleted, reduce it to a plain `navigate(path)`. Read the whole
component before cutting; only lines 1–60 were inspected while planning, so confirm what else
touches `sheetOpen` before removing it.

Keep the `env(safe-area-inset-top)` comment. It records a defect found on physical hardware that is invisible in every browser.

- [ ] **Step 4: Collapse LandingPage**

Rewrite `src/pages/LandingPage.tsx` to render only `SEO`, `Header`, `LandingHero`, and the footer. Specifics:

- Delete the six section imports and the ambient pink/mint glow wrapper (there is video there now).
- Delete the **Contact** link from the footer nav — it anchors `#join`, which no longer exists. Keep Terms, Privacy, Help.
- Keep the legal entity line exactly as it is. It exists because Apple verifies Organization enrolment partly by visiting the company website (PR #439).
- Keep the signed-in redirect to `/dashboard` untouched.
- Update the `SEO` description to match the page. Keep the title as it is — it carries "DragonCandy", which `SEO` depends on for its title logic.
- The wrapper keeps `bg-landing-grape` rather than `bg-white`, so nothing flashes white behind the hero on load.

- [ ] **Step 5: Run the tests and the build**

Run: `npx vitest run src/components/landing/ && npm run typecheck && npm run build`
Expected: PASS. `HeroSection.test.tsx` will still pass at this point — its component still exists, just unused.

- [ ] **Step 6: Look at it**

Run `npm run dev` and open `http://127.0.0.1:8080`. Check both viewports:
- Video plays, rotates, crossfades
- Desktop serves `-wide.mp4`, phone serves the portrait file (Network tab)
- Slogan legible over the brightest frame of every clip
- One button; it goes to the signup role picker

- [ ] **Step 7: Commit**

```bash
git add src/pages/LandingPage.tsx src/components/landing/Header.tsx src/components/landing/Header.test.tsx
git commit -m "feat: landing page is one screen — hero, backdrop, single CTA"
```

---

### Task 8: Delete what is now dead

**Files (all deleted):**
- `src/components/landing/`: `HeroSection.tsx`, `HeroSection.test.tsx`, `HeroDoors.tsx`, `HeroVideoBackdrop.tsx`, `PositioningBand.tsx`, `PositioningBand.test.tsx`, `ValuesSection.tsx`, `ValuesSection.test.tsx`, `HowItWorks.tsx`, `HowItWorks.test.tsx`, `DonnySection.tsx`, `DonnySection.test.tsx`, `FinalCTASection.tsx`, `FinalCTASection.test.tsx`, `BriefGeneratorPreview.tsx`, `useLandingBackdropPlaylist.ts`, `useLandingBackdropPlaylist.test.tsx`, `heroRole.ts`, `heroRole.test.ts`, `Reveal.tsx`
- Modify: `src/lib/featureConfig.ts` (remove `LANDING_VIDEO_BACKDROP_ENABLED`)
- Modify: `src/components/landing/landingClips.ts` (remove the old exports)

- [ ] **Step 1: Confirm each file is genuinely unreferenced**

```bash
for f in HeroSection HeroDoors HeroVideoBackdrop PositioningBand ValuesSection HowItWorks \
         DonnySection FinalCTASection BriefGeneratorPreview useLandingBackdropPlaylist \
         heroRole Reveal VideoSlot MediaSlot; do
  printf '%-28s ' "$f"
  grep -rl "$f" src --include='*.ts' --include='*.tsx' | grep -v "landing/$f\." | tr '\n' ' '
  echo
done
```

Expected: every name lists only files that are themselves on the delete list.

**`VideoSlot` and `MediaSlot` are on this list conditionally** — delete them only if this grep shows no live consumer. `Eyebrow` and `LandingButton` are **not** on the list: `Eyebrow` is used by `src/components/auth/RoleSelection.tsx` and both are used by `LandingHero`.

- [ ] **Step 2: Delete**

```bash
git rm src/components/landing/{HeroSection,HeroDoors,HeroVideoBackdrop,PositioningBand,ValuesSection,HowItWorks,DonnySection,FinalCTASection,BriefGeneratorPreview,Reveal}.tsx
git rm src/components/landing/{HeroSection,PositioningBand,ValuesSection,HowItWorks,DonnySection,FinalCTASection,useLandingBackdropPlaylist}.test.tsx
git rm src/components/landing/{useLandingBackdropPlaylist,heroRole}.ts
git rm src/components/landing/heroRole.test.ts
```

- [ ] **Step 3: Remove the feature flag**

Delete `LANDING_VIDEO_BACKDROP_ENABLED` from `src/lib/featureConfig.ts`.

A flag whose off state is now a blank homepage is not a kill switch. The real fallback lives inside `RotatingBackdrop`: no clips, failed clips, or `prefers-reduced-motion` all degrade to a poster still and the page still works.

- [ ] **Step 4: Remove the superseded registry exports**

From `landingClips.ts`, delete `LandingClipKey`, `LandingClip`, `LANDING_CLIPS`, `LANDING_PLAYLISTS`, `resolveLandingClip`, `useLandingClip`, `resolveLandingPlaylist`, `useLandingPlaylist`, `mergeBackdropPlaylist`, `DYNAMIC_BACKDROP_KEYS`, `BACKDROP_MERGED_CAP`. Delete their cases from `landingClips.test.ts`.

Keep `playlistSignature` **only if** `RotatingBackdrop` still uses it as a remount key; otherwise delete it too.

- [ ] **Step 5: Verify the tree is clean**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all PASS. Typecheck is the real gate — it catches any import of a deleted symbol.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete the six landing sections, the backdrop flag, and the orphans

heroRole.ts was already dead before this change — nothing but its own test
imported it. Reveal.tsx becomes dead here: its only consumers were the five
deleted sections.

The feature flag is deleted rather than flipped: with the video as the page,
its off state ships a blank homepage. The genuine fallback is RotatingBackdrop's
poster-still path, which covers no-clips, failed-clips and reduced-motion."
```

---

### Task 9: Update the docs the code just falsified

**Files:**
- Modify: `docs/DESIGN_SYSTEM.md`
- Modify: `docs/runbooks/landing-video-backdrop-kit.md`
- Modify: `docs/PROJECT_CONTEXT.md` (§5 index line only)

- [ ] **Step 1: Correct DESIGN_SYSTEM.md**

Its Theme section currently states as a rule that the public landing is light and shares one visual identity with login and onboarding, and that `/internal` is the only dark surface. **All three claims are now false.**

Rewrite to say: the landing is dark and video-led; login, sign-up and onboarding stay light on the `landing-*` token system; `/internal` stays dark. Record that the seam between the dark landing and the white signup screen is known and accepted, and note `landing-mint-line-bright` as the text-over-video mint.

Leave the `env(safe-area-inset-top)` and `dvh` rules alone — this change depends on both.

- [ ] **Step 2: Rewrite the runbook**

`docs/runbooks/landing-video-backdrop-kit.md` describes producing clips for the old system. Replace with: the Drive source and the fact the Drive MCP cannot reach it, the two-encode ffmpeg recipe verbatim from Task 2, why `-an` / `-pix_fmt yuv420p` / `+faststart` are each required, how crop offsets are chosen and where they are recorded, the naming contract, and the 40 MB ceiling.

- [ ] **Step 3: Add the PROJECT_CONTEXT index line**

One line under §5. Prose belongs in `SHIPPED_LOG.md` — §5 loads into every session, so detail there is a permanent tax.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: landing is dark and video-led — correct the design system and runbook"
```

---

### Task 10: Review, verify, and open the PR

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all PASS. Paste the real output; do not summarise it.

- [ ] **Step 2: Reduced-motion check**

In Chrome DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload the landing page.
Expected: a poster still, **zero `.mp4` requests** in the Network tab.

- [ ] **Step 3: Contrast check against the worst case**

Step through every clip to its brightest frame and confirm the slogan, eyebrow and CTA remain legible. If the mint accent fails on a bright dish, **darken the scrim, not the accent** — the accent is the only brand colour left on the page.

- [ ] **Step 4: Codex second review (mandatory)**

Run: `codex review --base main --title "Landing: one cinematic screen, single CTA"`

Fix anything real and re-run until clean. Relay the verdict to the user. Codex's sandbox rejecting some of its own shell commands is expected, not a failure.

- [ ] **Step 5: Knowledge sync**

Run the `knowledge-sync` skill: wiki session source under `docs/wiki/raw/sessions/`, `/wiki-ops ingest`, full entry prepended to `docs/SHIPPED_LOG.md`. Include it in the PR.

- [ ] **Step 6: Open the PR — and stop**

```bash
git push -u origin feat/landing-cinematic-single-cta
gh pr create --title "Landing: one cinematic screen, single CTA" --body "$(cat <<'BODY'
The landing page becomes one screen: ten real reels from ABB and Uncle Rocco
playing full-bleed behind a logo, an eyebrow, a slogan, and one button.

Deleted: the two doors, the values grid, how-it-works, the Donny section, the
free brief generator, the contact form, and the header nav. `leads` and
`capture-lead` stay deployed but become unreachable from the landing page.

The role question moves into signup, which already has a role-selection step —
nothing new was built for it.

`LANDING_VIDEO_BACKDROP_ENABLED` is deleted rather than flipped: with the video
as the page, its off state ships a blank homepage. The real fallback is
`RotatingBackdrop`'s poster-still path (no clips / failed clips / reduced motion).

Two encodes per clip — phones get the uncropped 9:16 reel, desktop gets a per-clip
16:9 crop chosen by watching each clip rather than centre-cropping.

Known cost: the page drops from ~600 indexable words to about ten, and organic
ranking will fall. Recovery lives outside this PR.

BLOCKED ON PERMISSION — do not merge. The reels are ABB's and Uncle Rocco's
content, owned in Drive by an external account. Publishing them on a public
marketing site needs written sign-off from both businesses. Merging deploys.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01VFYXFGMz9gJNrqUwh3xaNh
BODY
)"
```

**Do not merge.** Merging deploys, and going live needs written permission from ABB and Uncle Rocco for their footage. State plainly in the PR body that this is blocked on that permission.

- [ ] **Step 7: After merge only — verify prod**

Run the `verify-prod` skill: both viewports on dragoncandy.com, console clean, video playing, single CTA reaching the signup role picker.

---

## Out of scope

Darkening login/onboarding · changing the mission statement outside the hero · SEO recovery · undeploying `landing-clips` · a proof/testimonial surface · sourcing landscape footage · re-adding any deleted section.
