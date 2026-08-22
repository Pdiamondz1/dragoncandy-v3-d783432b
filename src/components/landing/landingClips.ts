/** One curated reel. `src`/`poster` are the as-shot 9:16 files and are always present;
 *  `wide`/`widePoster` are the 16:9 crop for landscape viewports. */
export interface LandingReel {
  src: string;
  poster: string;
  wide?: string;
  widePoster?: string;
}

const reel = (slug: string): LandingReel => ({
  src: `/landing/reels/${slug}.mp4`,
  poster: `/landing/reels/${slug}-poster.jpg`,
  wide: `/landing/reels/${slug}-wide.mp4`,
  widePoster: `/landing/reels/${slug}-wide-poster.jpg`,
});

/** The landing backdrop playlist, in rotation order. Curated only — no user uploads.
 *  Alternates the two restaurants deliberately — five clips from one business in a row
 *  would read as one restaurant's showreel rather than a marketplace. */
export const LANDING_REELS: LandingReel[] = [
  reel("abb-birria"),
  reel("uncle-rocco-steak-frites"),
  reel("abb-paella"),
  reel("uncle-rocco-brunch"),
  reel("abb-flatbread"),
  reel("uncle-rocco-new-menu"),
  reel("abb-montauk-monday"),
  reel("uncle-rocco-pancakes"),
  reel("abb-bread-pudding"),
  reel("uncle-rocco-reopening"),
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
