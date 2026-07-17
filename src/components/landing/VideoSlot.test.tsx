// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VideoSlot } from "./VideoSlot";

beforeEach(() => {
  // jsdom doesn't implement HTMLMediaElement.play; the ambient-play effect calls it.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined as unknown as void);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoSlot variant", () => {
  it("framed (default) keeps controls + aspect-video + rounding", () => {
    const { container } = render(<VideoSlot src="x.mp4" poster="p.jpg" />);
    const video = container.querySelector("video")!;
    expect(video).toBeTruthy();
    expect(video.hasAttribute("controls")).toBe(true);
    expect(container.querySelector(".aspect-video")).toBeTruthy();
  });

  it("backdrop drops controls, is full-bleed, uses object-cover, and keeps preload=none", () => {
    const { container } = render(<VideoSlot src="x.mp4" poster="p.jpg" variant="backdrop" />);
    const video = container.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(false);
    expect(video.getAttribute("preload")).toBe("none"); // hardening retained on backdrop (spec §5)
    expect(container.querySelector(".aspect-video")).toBeNull();
    expect(container.querySelector(".h-full.w-full.object-cover")).toBeTruthy();
    // The wrapper must self-position full-bleed (absolute), not relative — a `relative` class
    // here would win over an ancestor's `absolute inset-0` (Tailwind emits .relative after
    // .absolute), collapsing the backdrop into an in-flow flex item instead of full-bleed.
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toContain("absolute");
    expect(wrap.className).not.toContain("relative");
  });

  it("backdrop without src still renders the branded placeholder", () => {
    const { container } = render(<VideoSlot variant="backdrop" />);
    expect(container.querySelector("video")).toBeNull();
  });
});
