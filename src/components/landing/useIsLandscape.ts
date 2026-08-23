import { useEffect, useState } from "react";

/**
 * True when the viewport is wider than it is tall. Resolves SYNCHRONOUSLY on first render by
 * reading `matchMedia` in the `useState` initialiser — a lazy `useState(false)` corrected in an
 * effect would make every desktop visitor fetch the portrait encode and then immediately
 * re-fetch the wide one, wasting a video download on a page whose entire content is video.
 * Defaults to FALSE (portrait) when `matchMedia` is unavailable — jsdom and the prerendered
 * shell both lack it, and portrait is the encode that always exists, so the safe default can
 * never resolve to a missing file. Mirrors the defaulting in `usePrefersReducedMotion`.
 */
export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(orientation: landscape)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(orientation: landscape)");
    setLandscape(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return landscape;
}
