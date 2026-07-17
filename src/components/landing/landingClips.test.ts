import { describe, it, expect } from "vitest";
import { resolveLandingClip, type LandingClipKey } from "./landingClips";

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
