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
    // relative + flex column + min-h-[100dvh] (not min-h-screen/100vh — iOS 100vh > 100dvh,
    // which alone would overflow on mobile): the header is now an absolute overlay taken out
    // of flow, the hero flexes to fill remaining space, and the footer sits shrink-0 at the
    // true bottom — one screen, no scroll, with overflow left un-clipped as a safety valve for
    // pathological viewports (see LandingHero + footer for the other three pieces of this fix).
    <div className="dc-landing relative flex min-h-[100dvh] flex-col bg-landing-grape text-white font-instrument">
      <SEO
        title="DragonCandy — Human-driven. AI-assisted."
        description="Real restaurants and real creators building content together, powered by Donny. AI assists. Humans drive."
        path="/landing"
      />

      <Header />

      <LandingHero />

      <footer className="shrink-0 border-t border-white/10 bg-white py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-landing-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs sm:flex-row sm:px-8 lg:px-12">
          <p className="text-landing-ink-soft">
            © {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · {LEGAL_ENTITY_LOCALITY}
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
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
      </footer>
    </div>
  );
}
