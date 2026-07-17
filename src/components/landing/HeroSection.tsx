import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { HERO_CONTENT, parseRoleParam, visibleRoles, type HeroRole } from "./heroRole";
import { playlistSignature } from "./landingClips";
import { useLandingBackdropPlaylist } from "./useLandingBackdropPlaylist";
import { RotatingBackdrop } from "./RotatingBackdrop";

/**
 * Faint dc-* gradient placeholders for the kinetic clip-wall (14 tiles, cycled) — replaced by
 * real poster stills once clips land in `landingClips.ts`. Module-scoped so the array isn't
 * rebuilt every render.
 */
const CLIP_WALL_GRADIENTS = [
  "from-dc-teal/60 to-dc-pink/30",
  "from-dc-pink-accent/50 to-dc-teal/20",
  "from-dc-pink/50 to-dc-teal-dark/30",
];
const CLIP_WALL_TILES = Array.from({ length: 14 }, (_, i) => i);

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roles = visibleRoles(BRAND_ROLE_ENABLED);
  const [role, setRole] = useState<HeroRole>(() =>
    parseRoleParam(params.get("role"), BRAND_ROLE_ENABLED),
  );
  const content = HERO_CONTENT[role];
  const playlist = useLandingBackdropPlaylist(content.clipKey);

  const scrollToSeeItWork = () => {
    document.getElementById("see-it-work")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[88vh] items-center overflow-hidden pt-28 lg:min-h-screen lg:pt-32"
    >
      {/* Full-bleed cinematic backdrop — per-role playlist that crossfades between clips, then
          loops; gradient fallback pre-clips. Keyed on playlistSignature(role, playlist) so it
          remounts a fresh rotation (arming at clip 0) both when the visitor switches sides AND
          when the resolved clip contents change — e.g. real boosted clips arriving after the
          static fallback lead the merged playlist, so the remount arms with the real clip. */}
      <RotatingBackdrop key={playlistSignature(role, playlist)} playlist={playlist} className="-z-20" />

      {/* Kinetic energy: faint drifting clip-wall (desktop only, static under reduced-motion).
          Rotate + scale are baked into the driftY keyframe itself (not a separate static
          transform) so the CSS animation doesn't clobber them while running. */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden lg:block" aria-hidden>
        <div className="absolute -inset-[6%] grid grid-cols-7 gap-2 opacity-20 [transform:rotate(-6deg)_scale(1.15)] motion-safe:animate-[driftY_28s_linear_infinite]">
          {CLIP_WALL_TILES.map((i) => (
            <div
              key={i}
              className={`aspect-square rounded-xl bg-gradient-to-br ${CLIP_WALL_GRADIENTS[i % CLIP_WALL_GRADIENTS.length]}`}
            />
          ))}
        </div>
      </div>

      {/* Legibility scrim */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-dc-dark via-dc-dark/85 to-dc-dark/50" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 lg:px-12">
        {/* Role pills — the morph switcher */}
        <div className="mb-7 flex flex-wrap items-center gap-2 animate-fade-in">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
                role === r
                  ? "bg-dc-teal text-dc-dark shadow-glow-teal"
                  : "border border-white/15 bg-white/5 text-white/60 hover:border-dc-teal/50 hover:text-white"
              }`}
            >
              {HERO_CONTENT[r].label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex items-center gap-3 animate-fade-in">
          <span className="text-xs font-bold uppercase tracking-[0.32em] text-dc-teal">
            ● Powered by Donny
          </span>
        </div>

        {/* key={role} restarts the entrance animation on each pill swap for a "morph" feel */}
        <div key={role} className="contents">
          <h1 className="max-w-3xl text-[2.75rem] font-extrabold leading-[0.95] tracking-tight text-white animate-fade-in-up sm:text-6xl lg:text-7xl xl:text-8xl">
            {content.headline}{" "}
            <span className="font-script text-gradient text-[3.25rem] font-normal leading-none sm:text-7xl lg:text-8xl xl:text-9xl">
              {content.accent}
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-white/65 animate-fade-in-up-delay-1 sm:text-lg lg:text-xl">
            {content.sub}
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 animate-fade-in-up-delay-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => navigate(`/auth?mode=signup&role=${content.signupRole}`)}
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-dc-teal px-8 text-base font-bold text-dc-dark transition-all duration-300 hover:bg-dc-teal-dark hover:shadow-glow-teal"
          >
            {content.primaryCta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={scrollToSeeItWork}
            className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:border-dc-teal hover:text-dc-teal"
          >
            See it work ↓
          </button>
        </div>

        {/* Floating proof chip */}
        <div className="mt-8 inline-flex max-w-full items-center gap-2 whitespace-normal rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur animate-fade-in-up-delay-3">
          <span aria-hidden>✨</span>
          Paste your website → a full campaign in 60s
        </div>
      </div>
    </section>
  );
};
