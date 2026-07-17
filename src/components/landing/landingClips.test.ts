import { describe, it, expect } from "vitest";
import {
  resolveLandingClip,
  resolveLandingPlaylist,
  LANDING_CLIPS,
  type LandingClip,
  type LandingClipKey,
} from "./landingClips";

describe("resolveLandingClip", () => {
  it("returns empty src/poster for an unfilled key (proof.reel is reserved, unrendered)", () => {
    expect(resolveLandingClip("proof.reel")).toEqual({ src: undefined, poster: undefined });
  });

  it("resolves the live hero clips wired into the registry", () => {
    for (const key of ["hero.business", "hero.creator", "hero.brand"] as const) {
      const clip = resolveLandingClip(key);
      expect(clip.src).toMatch(/^\/landing\/.+\.mp4$/);
      expect(clip.poster).toMatch(/^\/landing\/.+\.jpg$/);
    }
  });

  it("returns the configured entry when the registry has one", () => {
    const registry = { "hero.business": { src: "s.mp4", poster: "p.jpg" } } as Record<LandingClipKey, { src?: string; poster?: string }>;
    expect(resolveLandingClip("hero.business", registry)).toEqual({ src: "s.mp4", poster: "p.jpg" });
  });

  it("never throws on a key missing from a partial registry", () => {
    expect(resolveLandingClip("proof.reel", {} as never)).toEqual({ src: undefined, poster: undefined });
  });
});

describe("resolveLandingPlaylist", () => {
  it("returns an ordered multi-clip playlist for business and creator", () => {
    for (const key of ["hero.business", "hero.creator"] as const) {
      const list = resolveLandingPlaylist(key);
      expect(list.length).toBeGreaterThan(1);
      // First clip is unchanged from the single-clip registry (first frame stays the same).
      expect(list[0].src).toBe(LANDING_CLIPS[key].src);
      for (const clip of list) {
        expect(clip.src).toMatch(/^\/landing\/.+\.mp4$/);
        expect(clip.poster).toMatch(/^\/landing\/.+\.jpg$/);
      }
    }
  });

  it("falls back to the single registry clip when no playlist is registered (hero.brand)", () => {
    // hero.brand has no LANDING_PLAYLISTS entry but is wired in LANDING_CLIPS.
    const list = resolveLandingPlaylist("hero.brand");
    expect(list).toEqual([
      { src: LANDING_CLIPS["hero.brand"].src, poster: LANDING_CLIPS["hero.brand"].poster },
    ]);
  });

  it("returns an empty array when neither a playlist nor a single clip has a src (proof.reel)", () => {
    expect(resolveLandingPlaylist("proof.reel")).toEqual([]);
  });

  it("filters out playlist entries that have no src", () => {
    const playlists: Partial<Record<LandingClipKey, LandingClip[]>> = {
      "hero.business": [
        { src: "/landing/a.mp4", poster: "/landing/a.jpg" },
        { poster: "/landing/no-src.jpg" }, // dropped — no src
        { src: "/landing/b.mp4" },
      ],
    };
    const list = resolveLandingPlaylist("hero.business", playlists);
    expect(list.map((c) => c.src)).toEqual(["/landing/a.mp4", "/landing/b.mp4"]);
  });
});
