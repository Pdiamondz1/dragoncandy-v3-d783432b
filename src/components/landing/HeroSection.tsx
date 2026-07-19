import { lazy, Suspense } from "react";
import { LANDING_VIDEO_BACKDROP_ENABLED } from "@/lib/featureConfig";
import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";
import { HeroDoors } from "./HeroDoors";

// Lazy + flag-gated so the whole video-backdrop system (RotatingBackdrop, the playlist hook, its
// react-query/supabase fetch) stays out of the default bundle — it only loads when
// LANDING_VIDEO_BACKDROP_ENABLED is flipped on.
const HeroVideoBackdrop = lazy(() => import("./HeroVideoBackdrop"));

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

/**
 * Joe's static, light hero: eyebrow → colored H1 → sub → two CTAs that scroll in-page to the
 * two doors below (the doors themselves route to signup — see `HeroDoors`). The optional video
 * backdrop is a background layer only, off by default; the copy is dark ink throughout so it
 * stays legible whether the backdrop is on (light scrim) or off (plain white).
 */
export function HeroSection() {
  // `isolate` gives the section its own stacking context so the flag-gated video/scrim layers
  // (-z-20 / -z-10 in HeroVideoBackdrop) paint above the section's bg-white instead of being hidden
  // behind it (the video would otherwise be invisible when the flag is on). Inert while the flag is off.
  return (
    <section id="hero" className="relative isolate overflow-hidden bg-white pt-28 pb-16 text-center">
      {LANDING_VIDEO_BACKDROP_ENABLED && (
        <Suspense fallback={null}>
          <HeroVideoBackdrop />
        </Suspense>
      )}

      {/* Soft pink/mint corner glow — the SAME background lighting the auth/login pages use
          (mirrors AuthShell) so the landing hero and the sign-in screen match. Only when the video
          backdrop is off (the video is the background otherwise). Behind the content via -z-10 +
          the section's `isolate`. */}
      {!LANDING_VIDEO_BACKDROP_ENABLED && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-landing-pink/15 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-landing-mint/15 blur-3xl" />
        </div>
      )}

      <div className="relative mx-auto max-w-2xl px-5 sm:px-8">
        <Eyebrow className="text-landing-pink">Human-driven · AI-assisted</Eyebrow>

        <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.04] tracking-tight text-landing-ink sm:text-5xl lg:text-6xl">
          Where <span className="text-landing-pink">creators</span> and{" "}
          <span className="text-landing-mint">entrepreneurs</span> build together.
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-landing-ink-soft">
          DragonCandy connects business owners with talented social media creators — and gives
          both the tools to run and grow their businesses. AI assists. Humans drive.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <LandingButton variant="pink" onClick={() => scrollToId("business")}>
            I run a business
          </LandingButton>
          <LandingButton variant="mint" onClick={() => scrollToId("creators")}>
            I'm a creator
          </LandingButton>
        </div>

        <p className="mt-5 text-sm text-landing-ink-soft">
          Real people. Real partnerships. AI in the toolbelt.
        </p>
      </div>

      <HeroDoors />
    </section>
  );
}
