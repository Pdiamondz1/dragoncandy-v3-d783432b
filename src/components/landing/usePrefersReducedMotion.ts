import { useEffect, useState } from "react";

/**
 * Local prefers-reduced-motion hook — keeps the landing free of Framer Motion.
 * Shared by VideoSlot (single-clip player) and RotatingBackdrop (crossfade playlist).
 */
export function usePrefersReducedMotion(): boolean {
  // Initialize synchronously so the very first render already honors the preference
  // (otherwise ambient autoplay could fire for one frame before the effect runs).
  const [reduce, setReduce] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    // Modern API, with a fallback to the deprecated addListener for older Safari/iOS WebKit.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return reduce;
}
