// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { RotatingBackdrop } from "./RotatingBackdrop";
import type { LandingClip } from "./landingClips";

const clip = (n: number): LandingClip => ({
  src: `/landing/c${n}.mp4`,
  poster: `/landing/c${n}.jpg`,
});

beforeEach(() => {
  // jsdom implements none of these on HTMLMediaElement; the component drives them imperatively.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined as unknown as void);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  // `currentTime` setter throws "Not implemented" in jsdom — make it a plain writable prop.
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    writable: true,
    value: 0,
  });
  // Default: motion allowed (no matchMedia in jsdom → usePrefersReducedMotion returns false).
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as unknown as { currentTime?: number }).currentTime;
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

function mockReducedMotion() {
  (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

describe("RotatingBackdrop", () => {
  it("renders the branded gradient (no media) for an empty playlist", () => {
    const { container } = render(<RotatingBackdrop playlist={[]} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".bg-gradient-to-br")).toBeTruthy();
  });

  it("renders a single looping video for a one-clip playlist", () => {
    const { container, getByTestId } = render(<RotatingBackdrop playlist={[clip(1)]} />);
    const video = getByTestId("backdrop-single") as HTMLVideoElement;
    expect(video.hasAttribute("loop")).toBe(true);
    expect(container.querySelectorAll("video").length).toBe(1);
  });

  it("renders two crossfading layers for a multi-clip playlist, layer 0 active", () => {
    const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
    const l0 = getByTestId("backdrop-layer-0");
    const l1 = getByTestId("backdrop-layer-1");
    expect(l0.getAttribute("data-active")).toBe("true");
    expect(l0.className).toContain("opacity-100");
    expect(l1.getAttribute("data-active")).toBe("false");
    expect(l1.className).toContain("opacity-0");
  });

  it("advances to the next layer when the active clip ends", () => {
    const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
    const l0 = getByTestId("backdrop-layer-0");
    act(() => {
      fireEvent.ended(l0);
    });
    expect(getByTestId("backdrop-layer-1").getAttribute("data-active")).toBe("true");
    expect(getByTestId("backdrop-layer-0").getAttribute("data-active")).toBe("false");
  });

  it("keeps the outgoing layer on the just-ended clip until the fade finishes, then queues the next", () => {
    vi.useFakeTimers();
    try {
      const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
      const l0 = getByTestId("backdrop-layer-0") as HTMLVideoElement;
      act(() => {
        fireEvent.ended(l0);
      });
      // Immediately after: layer 0 must still hold the clip that just ended (c1), not the queued c3.
      expect((getByTestId("backdrop-layer-0") as HTMLVideoElement).src).toContain("c1.mp4");
      // After the crossfade window, the now-hidden layer swaps to the queued clip (c3).
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect((getByTestId("backdrop-layer-0") as HTMLVideoElement).src).toContain("c3.mp4");
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances to the next layer when the active (leading) clip errors — no stall", () => {
    // A leading clip that fails to load/decode (e.g. an undecodable .MOV) fires `error`, never
    // `ended`; the rotation must advance off it instead of freezing on a blank layer.
    const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
    const l0 = getByTestId("backdrop-layer-0");
    act(() => {
      fireEvent.error(l0);
    });
    expect(getByTestId("backdrop-layer-1").getAttribute("data-active")).toBe("true");
    expect(getByTestId("backdrop-layer-0").getAttribute("data-active")).toBe("false");
  });

  it("skips a preloaded clip that is already unplayable when it becomes active", () => {
    // Simulate the incoming (hidden) layer having already errored during preload: its `error`
    // event fired while hidden and will never re-fire, and it will never fire `ended`. When the
    // active clip ends, advancing must skip the dead preloaded clip rather than stall on it.
    const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
    const l1 = getByTestId("backdrop-layer-1") as HTMLVideoElement;
    // Layer 1 preloaded clip index 1 (c2) and it "failed": give it a non-null MediaError.
    Object.defineProperty(l1, "error", {
      configurable: true,
      get: () => ({ code: 4 }) as unknown as MediaError,
    });
    act(() => {
      fireEvent.ended(getByTestId("backdrop-layer-0")); // active clip ends → advance
    });
    // Advanced (did not stall): layer 1 is now the visible layer...
    expect((getByTestId("backdrop-layer-1") as HTMLVideoElement).getAttribute("data-active")).toBe("true");
    // ...and it skipped the dead c2 to the next clip c3, rather than showing the unplayable one.
    expect((getByTestId("backdrop-layer-1") as HTMLVideoElement).src).toContain("c3.mp4");
    expect((getByTestId("backdrop-layer-1") as HTMLVideoElement).src).not.toContain("c2.mp4");
  });

  it("force-advances via the max-dwell watchdog if a clip never ends or errors (no stall)", () => {
    vi.useFakeTimers();
    try {
      const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
      expect(getByTestId("backdrop-layer-0").getAttribute("data-active")).toBe("true");
      // No `ended` and no `error` fired — a silently-undecodable/stalled clip. The watchdog must
      // still advance the rotation so it can never permanently freeze.
      act(() => {
        vi.advanceTimersByTime(15100);
      });
      expect(getByTestId("backdrop-layer-1").getAttribute("data-active")).toBe("true");
      expect(getByTestId("backdrop-layer-0").getAttribute("data-active")).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an `ended` fired by the non-active (hidden) layer", () => {
    const { getByTestId } = render(<RotatingBackdrop playlist={[clip(1), clip(2)]} />);
    act(() => {
      fireEvent.ended(getByTestId("backdrop-layer-1")); // hidden layer — must not flip
    });
    expect(getByTestId("backdrop-layer-0").getAttribute("data-active")).toBe("true");
  });

  it("renders a static poster image (no video) under reduced motion", () => {
    mockReducedMotion();
    const { container } = render(<RotatingBackdrop playlist={[clip(1), clip(2), clip(3)]} />);
    expect(container.querySelector("video")).toBeNull();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/landing/c1.jpg");
  });
});
