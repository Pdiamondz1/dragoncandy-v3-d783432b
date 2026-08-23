import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LANDING_REELS, resolveReelSource } from "./landingClips";

describe("LANDING_REELS", () => {
  it("has eight reels, each with a portrait source and poster", () => {
    expect(LANDING_REELS).toHaveLength(8);
    for (const reel of LANDING_REELS) {
      expect(reel.src).toMatch(/^\/landing\/reels\/[a-z0-9-]+\.mp4$/);
      expect(reel.poster).toMatch(/^\/landing\/reels\/[a-z0-9-]+-poster\.jpg$/);
    }
  });

  it("never plays two clips from the same restaurant back to back more than the split forces", () => {
    // Five ABB and three Uncle Rocco cannot alternate perfectly: in a cycle of 8, the
    // majority restaurant must touch itself at least 5 - 3 = 2 times. More than that and the
    // page starts reading as one restaurant's showreel, which is the thing this order exists
    // to prevent. Wraps, because the playlist loops.
    const restaurant = (src: string) =>
      src.includes("uncle-rocco") ? "uncle-rocco" : "abb";
    const names = LANDING_REELS.map((r) => restaurant(r.src));
    const abb = names.filter((n) => n === "abb").length;
    const adjacent = names.filter(
      (n, i) => n === names[(i + 1) % names.length],
    ).length;

    expect(abb).toBe(5);
    expect(adjacent).toBe(Math.abs(abb - (names.length - abb)));
  });

  it("carries no reel whose burned-in caption was the reason it was cut", () => {
    // uncle-rocco-brunch and uncle-rocco-pancakes showed a caption from the original post for
    // their whole duration, so neither could be trimmed to a clean window and both were
    // dropped. Re-adding either by slug would put competing text back under the slogan.
    const slugs = LANDING_REELS.map((r) => r.src);
    expect(slugs).not.toContain("/landing/reels/uncle-rocco-brunch.mp4");
    expect(slugs).not.toContain("/landing/reels/uncle-rocco-pancakes.mp4");
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
