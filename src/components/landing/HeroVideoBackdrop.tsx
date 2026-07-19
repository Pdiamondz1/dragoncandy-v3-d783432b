import { playlistSignature } from "./landingClips";
import { useLandingBackdropPlaylist } from "./useLandingBackdropPlaylist";
import { RotatingBackdrop } from "./RotatingBackdrop";

/**
 * The ONLY consumer of the cinematic video-backdrop system in the new (light) landing. Lazy-loaded
 * by `HeroSection` and rendered ONLY when `LANDING_VIDEO_BACKDROP_ENABLED` is on, so the video
 * modules (RotatingBackdrop, the playlist hook + its react-query/supabase fetch) stay out of the
 * default bundle. Default export so `lazy(() => import("./HeroVideoBackdrop"))` resolves it.
 *
 * Unlike the old dark hero, the scrim here is LIGHT (white, not `dc-dark`) — the hero content
 * sitting on top is dark ink (`text-landing-ink`), so it needs to stay legible over a light page,
 * not a dark one.
 */
export default function HeroVideoBackdrop() {
  const playlist = useLandingBackdropPlaylist("hero.business");

  return (
    <>
      <RotatingBackdrop
        key={playlistSignature("business", playlist)}
        playlist={playlist}
        className="-z-20"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-white via-white/85 to-white/40" />
    </>
  );
}
