/**
 * Swappable clip-source seam for the landing page. Components ask for a semantic key
 * and get back { src, poster } — blind to where it comes from.
 *
 * v1 source: this static registry, pointing at Cloudflare Stream playback URLs + poster
 * stills. Entries are EMPTY on purpose so VideoSlot degrades to its branded gradient until
 * the founder drops real URLs in (ship-before-clips). A future DragonFeed adapter can back
 * `resolveLandingClip` instead, with zero changes to any consuming component.
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

/** v1 registry — fill `src`/`poster` with Cloudflare Stream URLs when clips are ready. */
export const LANDING_CLIPS: Record<LandingClipKey, LandingClip> = {
  "hero.business": {},
  "hero.creator": {},
  "hero.brand": {},
  "proof.reel": {},
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
