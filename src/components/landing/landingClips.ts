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
 *  Spaces the two restaurants deliberately — several clips from one business in a row
 *  would read as one restaurant's showreel rather than a marketplace.
 *
 *  Eight reels, five ABB and three Uncle Rocco, so perfect alternation is impossible; this
 *  order holds the two unavoidable same-restaurant adjacencies (bread-pudding/montauk, and
 *  flatbread wrapping to birria) and no more.
 *
 *  Two reels were REMOVED rather than re-cut: `uncle-rocco-brunch` and
 *  `uncle-rocco-pancakes` each carried a burned-in caption from the original post for their
 *  entire duration ("What I mean by: 'Wanna grab brunch?'" and "This and an iced latte."),
 *  so there was no caption-free window to trim to. Three others were trimmed to one —
 *  see `docs/runbooks/landing-video-backdrop-kit.md` for the windows and why each was chosen.
 *  A reel's own text competes with the slogan sitting on top of it, and the slogan loses. */
export const LANDING_REELS: LandingReel[] = [
  reel("abb-birria"),
  reel("uncle-rocco-new-menu"),
  reel("abb-bread-pudding"),
  reel("abb-montauk-monday"),
  reel("uncle-rocco-steak-frites"),
  reel("abb-paella"),
  reel("uncle-rocco-reopening"),
  reel("abb-flatbread"),
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
