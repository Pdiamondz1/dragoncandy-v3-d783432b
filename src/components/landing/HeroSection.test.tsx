// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LandingClip } from "./landingClips";

// Mock the backdrop-playlist hook so the test drives exactly what the hero resolves — and so the
// real hook's supabase/react-query dependencies aren't pulled in.
vi.mock("./useLandingBackdropPlaylist", () => ({
  useLandingBackdropPlaylist: vi.fn(),
}));

import { useLandingBackdropPlaylist } from "./useLandingBackdropPlaylist";
import { HeroSection } from "./HeroSection";

const mockPlaylist = vi.mocked(useLandingBackdropPlaylist);

beforeEach(() => {
  // jsdom implements none of these on HTMLMediaElement; RotatingBackdrop drives them imperatively.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined as unknown as void);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    writable: true,
    value: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as unknown as { currentTime?: number }).currentTime;
});

const staticOnly: LandingClip[] = [
  { src: "/landing/static-a.mp4", poster: "/landing/static-a.jpg" },
  { src: "/landing/static-b.mp4", poster: "/landing/static-b.jpg" },
];
// Real boosted clips arriving after first paint LEAD the merged playlist (dynamic-first).
const dynamicLed: LandingClip[] = [
  { src: "https://cdn/boost-x.mp4" },
  { src: "/landing/static-a.mp4", poster: "/landing/static-a.jpg" },
  { src: "/landing/static-b.mp4", poster: "/landing/static-b.jpg" },
];

describe("HeroSection backdrop signature-key remount", () => {
  it("re-arms the leading backdrop clip when dynamic clips arrive (signature key drives a remount)", () => {
    // First paint: static-only playlist → the leading rotating layer arms with the static clip.
    mockPlaylist.mockReturnValue(staticOnly);
    const { getByTestId, rerender } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );
    expect((getByTestId("backdrop-layer-0") as HTMLVideoElement).src).toContain("static-a.mp4");

    // Boosted clips resolve and now LEAD the merged playlist. Because HeroSection keys
    // RotatingBackdrop on playlistSignature(role, playlist) (NOT key={role}), the signature
    // changes → RotatingBackdrop remounts and arms clip 0 with the real dynamic clip. A regression
    // back to key={role} would keep the stale instance, whose index-based re-arm skips reloading
    // clip 0, so the leading src would remain the static clip and this assertion would fail.
    mockPlaylist.mockReturnValue(dynamicLed);
    rerender(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );
    expect((getByTestId("backdrop-layer-0") as HTMLVideoElement).src).toContain("boost-x.mp4");
    expect((getByTestId("backdrop-layer-0") as HTMLVideoElement).src).not.toContain("static-a.mp4");
  });
});
