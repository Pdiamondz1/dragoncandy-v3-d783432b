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

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="dc-landing min-h-screen overflow-x-hidden bg-white text-landing-ink font-instrument">
      <SEO
        title="DragonCandy — Human-driven. AI-assisted."
        description="DragonCandy connects business owners with talented social media creators — and gives both the tools to run and grow their businesses. AI assists. Humans drive."
        path="/landing"
      />

      <Header />

      <main>
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
      </footer>
    </div>
  );
}
