import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { PositioningBand } from "@/components/landing/PositioningBand";
import { ValuesSection } from "@/components/landing/ValuesSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { DonnySection } from "@/components/landing/DonnySection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { useAuth } from "@/hooks/useAuth";
import { LEGAL_ENTITY_LOCALITY, LEGAL_ENTITY_NAME } from "@/lib/legalEntity";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="dc-landing relative isolate min-h-screen bg-white text-landing-ink font-instrument">
      {/* Ambient top glow behind the header + hero, so the sticky header shares the hero's soft
          pink/mint lighting instead of reading as a flat white bar. Behind content via -z-10 and
          the wrapper's `isolate` stacking context. NOTE: overflow-x clipping lives on `<main>`
          below, NOT this wrapper — an overflow value here would make it a scroll container and
          break the header's `sticky top-0` (it would stick to the wrapper, not `#main-content`). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-landing-pink/15 blur-3xl" />
        <div className="absolute -top-16 right-0 h-72 w-72 rounded-full bg-landing-mint/10 blur-3xl" />
      </div>

      <SEO
        title="DragonCandy — Human-driven. AI-assisted."
        description="DragonCandy connects business owners with talented social media creators — and gives both the tools to run and grow their businesses. AI assists. Humans drive."
        path="/landing"
      />

      <Header />

      {/* overflow-x-hidden lives HERE (not on the wrapper) so it clips off-screen content
          (e.g. the lead-form honeypot at left-[-9999px]) against the app shell's #main-content
          scroller WITHOUT becoming the sticky header's scroll container. */}
      <main className="overflow-x-hidden">
        <HeroSection />
        <PositioningBand />
        <ValuesSection />
        <HowItWorks />
        <DonnySection />
        <FinalCTASection />
      </main>

      <footer className="border-t border-landing-line py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-sm sm:flex-row sm:justify-between sm:px-8 lg:px-12">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <img src="/logo.webp" alt="DragonCandy" className="h-6 w-auto" />
            <span className="font-pixel text-[11px] uppercase tracking-[0.14em] text-landing-ink-soft">
              DragonCandy · Human-driven. AI-assisted.
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="#join" className="text-landing-ink-soft transition-colors hover:text-landing-ink">
              Contact
            </a>
            <Link to="/terms" className="text-landing-ink-soft transition-colors hover:text-landing-ink">
              Terms
            </Link>
            <Link to="/privacy" className="text-landing-ink-soft transition-colors hover:text-landing-ink">
              Privacy
            </Link>
            <Link to="/help" className="text-landing-ink-soft transition-colors hover:text-landing-ink">
              Help
            </Link>
          </nav>
        </div>
        {/* Legal entity line. Deliberately a sibling BELOW the row above, not nested inside its
            left cluster — nesting would force that cluster's alignment classes to change and
            disturb the existing desktop row. Container classes mirror the row's exactly
            (mx-auto max-w-6xl + the same px ramp) so it aligns to the logo's left edge on
            desktop and the same gutters on mobile. text-xs steps down from the row's inherited
            text-sm so it reads as subordinate; no pixel font / uppercase (the tagline owns that
            treatment) and no extra divider. */}
        <p className="mx-auto mt-8 max-w-6xl px-5 text-center text-xs text-landing-ink-soft sm:px-8 sm:text-left lg:px-12">
          © {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · {LEGAL_ENTITY_LOCALITY}
        </p>
      </footer>
    </div>
  );
}
