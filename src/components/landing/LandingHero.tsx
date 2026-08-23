import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";
import { RotatingBackdrop } from "./RotatingBackdrop";
import { LANDING_REELS } from "./landingClips";

/**
 * The whole landing page above the footer: real reels full-bleed, one eyebrow, one slogan,
 * one CTA. `isolate` gives the section its own stacking context so the backdrop's -z-10 paints
 * above the section background rather than behind it.
 *
 * `flex-1` (not `min-h-[100dvh]`) — the page itself is the single `min-h-[100dvh]` flex column
 * now (see LandingPage.tsx), with the header absolutely overlaid and the footer shrink-0 below;
 * this section fills whatever's left. Claiming the full viewport height here too would push the
 * footer off-screen. `dvh` still governs the OUTER wrapper for the same reason as before — the
 * app document never scrolls, so iOS toolbars never collapse and `vh` overshoots the visible
 * area (DESIGN_SYSTEM.md).
 */
export function LandingHero() {
  return (
    <section className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden bg-landing-grape px-5 text-center sm:px-8">
      <RotatingBackdrop playlist={LANDING_REELS} className="-z-20" />

      {/* Scrim. Darker top and bottom so the header and the CTA stay legible over a bright
          frame; lighter through the middle so the footage still reads as footage. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-landing-grape/70 via-landing-grape/40 to-landing-grape/85"
      />

      <Eyebrow className="text-white/65">People-Driven · Donny-Assisted</Eyebrow>

      <h1 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
        Where <span className="text-landing-pink-line">Restaurants</span> &amp;{" "}
        <span className="text-landing-mint-line-bright">Creators</span> build content together.
      </h1>

      <LandingButton
        variant="pink"
        href="/auth?mode=signup"
        className="mt-9 px-10 py-4 text-lg"
      >
        Get started
      </LandingButton>
    </section>
  );
}
