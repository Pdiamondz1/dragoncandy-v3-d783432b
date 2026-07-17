import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface VideoSlotProps {
  /** Final video URL (mp4/hls). Drop in to replace the placeholder. */
  src?: string;
  poster?: string;
  /** Label shown on the placeholder (no src). */
  label?: string;
  /** Ambient autoplay/muted/loop (default). Set false for a click-to-play player. */
  autoplay?: boolean;
  /** Layout variant: "framed" (default, 16:9 aspect + controls) or "backdrop" (full-bleed, no controls). */
  variant?: "framed" | "backdrop";
  className?: string;
}

/** Local prefers-reduced-motion — keeps the landing free of Framer Motion. */
function usePrefersReducedMotion(): boolean {
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

/**
 * A branded 16:9 video slot. With `src` it plays as an ambient reel — muted, looped, inline,
 * and (the hardening) only **when scrolled into view**: a reel can't autoplay or even load its
 * data while it's far below the fold (`preload="none"` + an IntersectionObserver gate), so a
 * future reel can't spike memory on load. Under prefers-reduced-motion (or `autoplay={false}`)
 * it's a plain click-to-play player. Without `src` it shows an on-brand placeholder.
 */
export function VideoSlot({
  src,
  poster,
  label = "Showreel",
  autoplay = true,
  variant = "framed",
  className = "",
}: VideoSlotProps) {
  const reduce = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambient = autoplay && !reduce;
  const isBackdrop = variant === "backdrop";

  // Arm ambient playback only while the slot is on screen; pause when it leaves.
  useEffect(() => {
    if (!src || !ambient) return;
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video || typeof IntersectionObserver === "undefined") {
      video?.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: "100px 0px" },
    );
    io.observe(wrap);
    return () => {
      io.disconnect();
      video.pause(); // stop ambient playback if autoplay is revoked (e.g. reduced-motion flips on)
    };
  }, [src, ambient]);

  const wrapClass = isBackdrop
    ? `absolute inset-0 h-full w-full overflow-hidden ${className}`
    : `relative aspect-video overflow-hidden rounded-3xl ${className}`;

  return (
    <div ref={wrapRef} className={wrapClass}>
      {src ? (
        <video
          ref={videoRef}
          muted={ambient}
          loop={ambient}
          playsInline
          controls={!isBackdrop}
          poster={poster}
          preload="none"
          className="h-full w-full object-cover"
        >
          <source src={src} />
        </video>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-dc-dark to-dc-pink-accent/25 ${isBackdrop ? "" : "ring-1 ring-inset ring-white/10"}`}>
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-dc-teal/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-dc-pink-accent/20 blur-3xl" />
          {!isBackdrop && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-dc-teal text-dc-dark shadow-glow-teal">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" aria-hidden />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
                {label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
