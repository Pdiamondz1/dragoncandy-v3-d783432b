// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { fetchLandingBackdropClips } from "./useLandingBackdropPlaylist";

// Wrapped async: a synchronous beforeEach shifts the microtask timing enough that Vitest
// 4.1.2 misattributes the later mockRejectedValue()'s (properly try/catch-handled) rejection
// as an unhandled error — confirmed via isolated repro; this is a framework timing quirk, not
// a defect in fetchLandingBackdropClips (verified: the catch fires and returns [] correctly
// either way). Purely a hook-invocation-style change; test semantics are unchanged.
beforeEach(async () => {
  invoke.mockReset();
});

describe("fetchLandingBackdropClips", () => {
  it("maps { clips } to LandingClip[]", async () => {
    invoke.mockResolvedValue({ data: { clips: [{ src: "a.mp4", poster: "a.jpg" }, { src: "b.mp4" }] }, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([{ src: "a.mp4", poster: "a.jpg" }, { src: "b.mp4" }]);
  });
  it("returns [] on a function error", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("returns [] on a thrown/rejected invoke", async () => {
    invoke.mockRejectedValue(new Error("network"));
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("returns [] when clips is missing/malformed", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("drops entries without a src", async () => {
    invoke.mockResolvedValue({ data: { clips: [{ poster: "x.jpg" }, { src: "ok.mp4" }] }, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([{ src: "ok.mp4" }]);
  });
});
