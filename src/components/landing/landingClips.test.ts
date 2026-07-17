import { describe, it, expect } from "vitest";
import { resolveLandingClip, type LandingClipKey } from "./landingClips";

describe("resolveLandingClip", () => {
  it("returns empty src/poster for an unfilled key (ship-before-clips)", () => {
    expect(resolveLandingClip("hero.business")).toEqual({ src: undefined, poster: undefined });
  });

  it("returns the configured entry when the registry has one", () => {
    const registry = { "hero.business": { src: "s.mp4", poster: "p.jpg" } } as Record<LandingClipKey, { src?: string; poster?: string }>;
    expect(resolveLandingClip("hero.business", registry)).toEqual({ src: "s.mp4", poster: "p.jpg" });
  });

  it("never throws on a key missing from a partial registry", () => {
    expect(resolveLandingClip("proof.reel", {} as never)).toEqual({ src: undefined, poster: undefined });
  });
});
