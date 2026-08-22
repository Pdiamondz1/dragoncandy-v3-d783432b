import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LANDING_REELS, resolveReelSource } from "./landingClips";

describe("LANDING_REELS", () => {
  it("has ten reels, each with a portrait source and poster", () => {
    expect(LANDING_REELS).toHaveLength(10);
    for (const reel of LANDING_REELS) {
      expect(reel.src).toMatch(/^\/landing\/reels\/[a-z0-9-]+\.mp4$/);
      expect(reel.poster).toMatch(/^\/landing\/reels\/[a-z0-9-]+-poster\.jpg$/);
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
