import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { LandingHero } from "@/components/landing/LandingHero";
import { RotatingBackdrop } from "@/components/landing/RotatingBackdrop";
import { LANDING_REELS } from "@/components/landing/landingClips";
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
    // bg-landing-grape (not bg-white) — the backdrop is dark video, so a white page background
    // would flash behind it before the first frame paints.
    // relative + isolate + flex column + min-h-[100dvh] (not min-h-screen/100vh — iOS 100vh >
    // 100dvh, which alone would overflow on mobile): the header is an absolute overlay taken out
    // of flow, the hero flexes to fill remaining space, and the footer sits shrink-0 at the true
    // bottom — one screen, no scroll, with overflow left un-clipped as a safety valve for
    // pathological viewports. `isolate` gives the page its own stacking context so the backdrop's
    // negative z-index paints above this element's own background rather than behind it.
    <div className="dc-landing relative isolate flex min-h-[100dvh] flex-col bg-landing-grape text-white font-instrument">
      <SEO
        title="DragonCandy — Human-driven. AI-assisted."
        description="Real restaurants and real creators building content together, powered by Donny. AI assists. Humans drive."
        path="/landing"
      />

      {/* The footage backs the WHOLE page, not just the hero. It used to live inside LandingHero,
          which left the footer as an opaque white band across the bottom of a page whose entire
          premise is one full-bleed cinematic screen. Mounting it here lets the video run edge to
          edge and the legal line float over it. */}
      <RotatingBackdrop playlist={LANDING_REELS} className="-z-20" />

      {/* Scrim. Darker at top and bottom so the header, the CTA and the footer stay legible over
          a bright frame; lighter through the middle so the footage still reads as footage. The
          bottom stop is the heaviest because the footer's text is the smallest on the page and
          therefore needs the highest contrast ratio. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-landing-grape/70 via-landing-grape/40 to-landing-grape/95"
      />

      <Header />

      <LandingHero />

      {/* Transparent by design — no background, no top border. Both would re-draw the seam this
          footer was changed to remove. Legibility comes from the scrim above, measured against
          each reel's brightest frame rather than assumed. */}
      <footer className="shrink-0 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs sm:flex-row sm:px-8 lg:px-12">
          <p className="text-white/70">
            © {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · {LEGAL_ENTITY_LOCALITY}
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/terms" className="text-white/70 transition-colors hover:text-white">
              Terms
            </Link>
            <Link to="/privacy" className="text-white/70 transition-colors hover:text-white">
              Privacy
            </Link>
            <Link to="/help" className="text-white/70 transition-colors hover:text-white">
              Help
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
