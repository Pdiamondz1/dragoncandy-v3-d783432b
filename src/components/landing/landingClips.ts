/**
 * Swappable clip-source seam for the landing page. Components ask for a semantic key
 * and get back { src, poster } — blind to where it comes from.
 *
 * v1 source: this static registry. `src` is a **direct MP4 URL** (e.g. `/landing/hero-business.mp4`
 * served from `public/`, or an R2/CDN URL); `poster` is a still-image URL. Entries are EMPTY on
 * purpose so VideoSlot degrades to its branded gradient until real clips are dropped in
 * (ship-before-clips). A future DragonFeed adapter can back `resolveLandingClip` instead, with zero
 * changes to any consuming component.
 *
 * Producing + wiring clips: docs/runbooks/landing-video-backdrop-kit.md
 */
export type LandingClipKey =
  | "hero.business"
  | "hero.creator"
  | "hero.brand"
  | "proof.reel";

export interface LandingClip {
  src?: string;
  poster?: string;
}

/** v1 registry — direct MP4 + poster URLs served from `public/landing/`. */
export const LANDING_CLIPS: Record<LandingClipKey, LandingClip> = {
  "hero.business": {
    src: "/landing/hero-business.mp4",
    poster: "/landing/hero-business-poster.jpg",
  },
  "hero.creator": {
    src: "/landing/hero-creator.mp4",
    poster: "/landing/hero-creator-poster.jpg",
  },
  "hero.brand": {
    // Staged — the Brand pill is hidden behind BRAND_ROLE_ENABLED, so this clip
    // isn't fetched until Brand launches; ready the instant the flag flips.
    src: "/landing/hero-brand.mp4",
    poster: "/landing/hero-brand-poster.jpg",
  },
  "proof.reel": {}, // reserved — no component renders this yet
};

export function resolveLandingClip(
  key: LandingClipKey,
  registry: Record<LandingClipKey, LandingClip> = LANDING_CLIPS,
): LandingClip {
  const entry = registry[key];
  return { src: entry?.src, poster: entry?.poster };
}

/** Hook form for components. v1 is a pure pass-through over the static registry. */
export function useLandingClip(key: LandingClipKey): LandingClip {
  return resolveLandingClip(key);
}
