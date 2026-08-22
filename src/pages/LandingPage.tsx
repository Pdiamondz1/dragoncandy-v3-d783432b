import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { LandingHero } from "@/components/landing/LandingHero";
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
    // bg-landing-grape (not bg-white) — the hero's backdrop is dark video, so a white page
    // background would flash behind it before the first frame paints.
    <div className="dc-landing min-h-screen bg-landing-grape text-white font-instrument">
      <SEO
        title="DragonCandy — Human-driven. AI-assisted."
        description="Real restaurants and real creators building content together, powered by Donny. AI assists. Humans drive."
        path="/landing"
      />

      <Header />

      <LandingHero />

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-sm sm:flex-row sm:justify-between sm:px-8 lg:px-12">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <img src="/logo.webp" alt="DragonCandy" className="h-6 w-auto" />
            <span className="font-pixel text-[11px] uppercase tracking-[0.14em] text-white/60">
              DragonCandy · Human-driven. AI-assisted.
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/terms" className="text-white/60 transition-colors hover:text-white">
              Terms
            </Link>
            <Link to="/privacy" className="text-white/60 transition-colors hover:text-white">
              Privacy
            </Link>
            <Link to="/help" className="text-white/60 transition-colors hover:text-white">
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
        <p className="mx-auto mt-8 max-w-6xl px-5 text-center text-xs text-white/60 sm:px-8 sm:text-left lg:px-12">
          © {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · {LEGAL_ENTITY_LOCALITY}
        </p>
      </footer>
    </div>
  );
}
