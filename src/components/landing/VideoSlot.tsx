import { Play } from "lucide-react";
import { useReducedMotion } from "@/lib/motion";

interface VideoSlotProps {
  /** Final video URL (mp4/hls). Drop in to replace the placeholder. */
  src?: string;
  poster?: string;
  /** Label shown on the placeholder (no src). */
  label?: string;
  /** Ambient autoplay/muted/loop (default). Set false for a click-to-play player. */
  autoplay?: boolean;
  className?: string;
}

/**
 * A branded 16:9 video slot. With `src` it plays as an ambient hero reel — autoplay,
 * muted, looped, inline (the premium "creator hub" feel). Under prefers-reduced-motion
 * (or `autoplay={false}`) it falls back to a click-to-play player showing the poster.
 * Without `src` it shows an on-brand placeholder so the section looks finished before
 * the real reel is dropped in.
 */
export function VideoSlot({
  src,
  poster,
  label = "Showreel",
  autoplay = true,
  className = "",
}: VideoSlotProps) {
  const reduce = useReducedMotion();
  const ambient = autoplay && !reduce;

  return (
    <div className={`relative aspect-video overflow-hidden rounded-3xl ${className}`}>
      {src ? (
        ambient ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            controls
            poster={poster}
            preload="metadata"
            className="h-full w-full object-cover"
          >
            <source src={src} />
          </video>
        ) : (
          // Reduced motion / opt-out: don't autoplay — let the visitor start it.
          <video
            controls
            preload="none"
            poster={poster}
            className="h-full w-full object-cover"
          >
            <source src={src} />
          </video>
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-dc-dark to-dc-pink-accent/25 ring-1 ring-inset ring-white/10">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-dc-teal/25 blur-3xl animate-float" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-dc-pink-accent/20 blur-3xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-dc-teal text-dc-dark shadow-glow-teal">
              <Play className="h-6 w-6 translate-x-0.5 fill-current" aria-hidden />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
              {label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
