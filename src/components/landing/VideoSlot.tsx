import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

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
    const video = videoRef.current;
    if (!src || !video) return;

    // The morphing hero swaps `src` on the SAME <video>. Because the URL lives on a
    // <source> child, the element keeps playing the OLD clip until the resource-selection
    // algorithm re-runs — so reload it whenever `src` changes (otherwise switching roles
    // keeps the previous role's backdrop).
    video.load();

    if (!ambient) return; // reduced-motion / autoplay off → poster (the new one) only

    const wrap = wrapRef.current;
    if (!wrap || typeof IntersectionObserver === "undefined") {
      video.play().catch(() => {});
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
        <div className={`absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-white to-dc-pink-accent/25 ${isBackdrop ? "" : "ring-1 ring-inset ring-dc-text/10"}`}>
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-dc-teal/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-dc-pink-accent/20 blur-3xl" />
          {!isBackdrop && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-dc-teal text-dc-dark shadow-glow-teal">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" aria-hidden />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-dc-text-muted/70">
                {label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
