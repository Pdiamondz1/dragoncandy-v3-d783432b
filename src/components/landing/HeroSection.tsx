import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";

// Drop a Nano Banana Pro cinematic hero image URL here to replace the gradient backdrop.
// Leave empty to ship the branded gradient placeholder.
const HERO_IMAGE = "";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const signup = () => navigate("/auth?mode=signup");

  return (
    <section className="relative flex min-h-[88vh] items-center overflow-hidden lg:min-h-screen">
      {/* Full-bleed cinematic backdrop */}
      <div className="absolute inset-0">
        {HERO_IMAGE ? (
          <img src={HERO_IMAGE} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-dc-teal/20 via-dc-dark to-dc-pink-accent/20">
            <div className="pointer-events-none absolute -right-32 top-10 h-[34rem] w-[34rem] rounded-full bg-dc-teal/20 blur-3xl animate-float" />
            <div className="pointer-events-none absolute -bottom-40 -left-28 h-[30rem] w-[30rem] rounded-full bg-dc-pink-accent/15 blur-3xl" />
          </div>
        )}
        {/* Legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-dc-dark via-dc-dark/85 to-dc-dark/50" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-28 pb-16 sm:px-8 lg:px-12 lg:pt-32">
        <div className="mb-6 flex items-center gap-3 animate-fade-in">
          <span className="h-2 w-2 rounded-full bg-dc-teal shadow-glow-teal" />
          <span className="text-xs font-bold uppercase tracking-[0.32em] text-dc-teal">
            Powered by Donny AI
          </span>
        </div>

        <h1 className="max-w-3xl text-[2.75rem] font-extrabold leading-[0.95] tracking-tight text-white animate-fade-in-up sm:text-6xl lg:text-7xl xl:text-8xl">
          Real content.
          <br />
          Real creators.
          <br />
          <span className="font-script text-gradient text-[3.25rem] font-normal leading-none sm:text-7xl lg:text-8xl xl:text-9xl">
            Real fast.
          </span>
        </h1>

        <p className="mt-7 max-w-xl text-base leading-relaxed text-white/65 animate-fade-in-up-delay-1 sm:text-lg lg:text-xl">
          DragonCandy turns any business into a content machine — vetted local creators,
          AI-built campaigns, and content delivered in hours, not weeks.
        </p>

        <div className="mt-10 flex flex-col gap-3 animate-fade-in-up-delay-2 sm:flex-row sm:flex-wrap">
          <button
            onClick={signup}
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-dc-teal px-8 text-base font-bold text-dc-dark transition-all duration-300 hover:bg-dc-teal-dark hover:shadow-glow-teal"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            onClick={signup}
            className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:border-dc-teal hover:text-dc-teal"
          >
            Join as a Creator
          </button>
          {BRAND_ROLE_ENABLED && (
            <button
              onClick={signup}
              className="inline-flex h-14 items-center justify-center rounded-full bg-dc-pink-accent-btn px-8 text-base font-semibold text-white transition-all duration-300 hover:bg-dc-pink-accent-btn-hover"
            >
              For Brands
            </button>
          )}
        </div>

        <p className="mt-8 text-sm text-white/40 animate-fade-in-up-delay-3">
          No credit card to start · A paid campaign in under 60 seconds
        </p>
      </div>
    </section>
  );
};
