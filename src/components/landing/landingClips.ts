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

/**
 * Per-role backdrop playlists — the hero rotates through these in order, then loops.
 * Ordered: the branded role clip first (kept identical to `LANDING_CLIPS[key]` so the first
 * frame the visitor sees is unchanged), then supporting clips. Each `{ src, poster }` is a
 * direct MP4 + still served from `public/landing/`. A key with no playlist entry falls back to
 * its single `LANDING_CLIPS` clip, so the seam degrades cleanly (and `hero.brand` — hidden
 * behind BRAND_ROLE_ENABLED — needs no playlist until Brand launches).
 */
export const LANDING_PLAYLISTS: Partial<Record<LandingClipKey, LandingClip[]>> = {
  "hero.business": [
    { src: "/landing/hero-business.mp4", poster: "/landing/hero-business-poster.jpg" },
    { src: "/landing/hero-business-2.mp4", poster: "/landing/hero-business-2-poster.jpg" },
    { src: "/landing/hero-business-3.mp4", poster: "/landing/hero-business-3-poster.jpg" },
    { src: "/landing/hero-business-4.mp4", poster: "/landing/hero-business-4-poster.jpg" },
    // Chef plating a dish while it's filmed — a still animated with a slow Ken Burns push-in.
    { src: "/landing/hero-business-5.mp4", poster: "/landing/hero-business-5-poster.jpg" },
  ],
  "hero.creator": [
    { src: "/landing/hero-creator.mp4", poster: "/landing/hero-creator-poster.jpg" },
    { src: "/landing/hero-creator-2.mp4", poster: "/landing/hero-creator-2-poster.jpg" },
    { src: "/landing/hero-creator-3.mp4", poster: "/landing/hero-creator-3-poster.jpg" },
    { src: "/landing/hero-creator-4.mp4", poster: "/landing/hero-creator-4-poster.jpg" },
  ],
};

/**
 * Resolve a role's ordered backdrop playlist. Returns only entries with a real `src`. Falls
 * back to the single `LANDING_CLIPS` clip when no playlist is registered, and to an empty array
 * when neither exists (RotatingBackdrop then shows its branded gradient — ship-before-clips).
 */
export function resolveLandingPlaylist(
  key: LandingClipKey,
  playlists: Partial<Record<LandingClipKey, LandingClip[]>> = LANDING_PLAYLISTS,
  registry: Record<LandingClipKey, LandingClip> = LANDING_CLIPS,
): LandingClip[] {
  const list = playlists[key];
  if (list && list.length > 0) return list.filter((c) => !!c.src);
  const single = resolveLandingClip(key, registry);
  return single.src ? [single] : [];
}

/** Hook form. Pure pass-through over the static playlist registry. */
export function useLandingPlaylist(key: LandingClipKey): LandingClip[] {
  return resolveLandingPlaylist(key);
}

/** Roles whose hero backdrop can lead with real (dynamic) clips. Brand stays static (hidden). */
const DYNAMIC_BACKDROP_KEYS: LandingClipKey[] = ["hero.business", "hero.creator"];
const BACKDROP_MERGED_CAP = 6;

/**
 * Merge real (dynamic) clips into the curated static playlist for eligible hero keys. The curated
 * clips LEAD (the polished, on-brand, known-good clip is always the first impression) and the
 * dynamic boosted clips TRAIL — real content still appears in the loop as social proof, but an
 * unpredictable-quality user upload (low-res, portrait, odd codec) never opens the hero. Returns the
 * static array UNCHANGED (same reference) for non-eligible keys or when there are no dynamic clips —
 * so the signature stays stable and nothing remounts. De-dupes by src; caps the total.
 */
export function mergeBackdropPlaylist(
  key: LandingClipKey,
  staticClips: LandingClip[],
  dynamicClips: LandingClip[],
): LandingClip[] {
  if (!DYNAMIC_BACKDROP_KEYS.includes(key) || dynamicClips.length === 0) return staticClips;
  const seen = new Set<string>();
  const merged: LandingClip[] = [];
  for (const c of [...staticClips, ...dynamicClips]) {
    if (!c.src || seen.has(c.src)) continue;
    seen.add(c.src);
    merged.push(c);
    if (merged.length >= BACKDROP_MERGED_CAP) break;
  }
  return merged;
}

/**
 * A stable string that changes whenever the playlist's clip CONTENTS change (grow, or same-length
 * different-clips), and stays identical when contents are unchanged. Used as the RotatingBackdrop
 * `key` so its index-based rotation always mounts against a stable playlist (see spec §4.3).
 */
export function playlistSignature(role: string, playlist: LandingClip[]): string {
  return `${role}::${playlist.map((c) => c.src ?? "").join("|")}`;
}
