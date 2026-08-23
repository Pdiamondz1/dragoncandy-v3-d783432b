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
          therefore needs the highest contrast ratio.
          The middle stop is 60%, not the 40% this shipped with. Re-cutting the reel library —
          `abb-flatbread` became a coal-oven fire, `uncle-rocco-new-menu` an outdoor daylight
          street — raised the brightest frames enough that the pink and mint accent words fell to
          1.88:1 and 1.90:1 across the brightest 10% of the band behind them, against the 3.0:1
          that large text needs. 60% is the lowest stop that clears 3.0 on BOTH the mean of the
          brightest frame and that frame's 90th percentile; 40/50/55 all clear the mean and fail
          the percentile. Measured per reel, not estimated — see the runbook. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-landing-grape/70 via-landing-grape/60 to-landing-grape/95"
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
            {/* A pill, not a plain link — the page asks for a signup and nothing else, so the one
                affordance for "explain this to me before I commit" has to be findable next to the
                legal text without competing with the CTA. Border + slightly brighter text is the
                whole difference; anything filled would read as a second call to action.
                It sits in the footer's band, where the scrim is heaviest (to-landing-grape/95) and
                white text measures 7.42:1 against the brightest frame across all encodes.
                The label is "How it works", NOT "Learn more" — which is what this shipped as, and
                which failed Lighthouse's `link-text` audit outright (SEO 0.92 against a 0.95 gate,
                one failing item, this link). "Learn more" is the canonical non-descriptive link
                text: it tells a crawler nothing and reads to a screen reader, out of the link
                list, as a link to nowhere in particular. Naming the destination fixes the audit
                for the reason the audit exists rather than masking it with an aria-label. */}
            <Link
              to="/how-it-works"
              className="rounded-full border border-white/30 px-4 py-1.5 text-white/90 transition-colors hover:border-white/60 hover:text-white"
            >
              How it works
            </Link>
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
