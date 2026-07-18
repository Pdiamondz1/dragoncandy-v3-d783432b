import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { DonnySection } from "@/components/landing/DonnySection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AudienceLanes } from "@/components/landing/AudienceLanes";
import { ProofSection } from "@/components/landing/ProofSection";
import { StartFreeSection } from "@/components/landing/StartFreeSection";
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
    // Light marketing surface — matches the (light) authenticated app. The cinematic video
    // backdrop stays full-bleed; legibility comes from a LIGHT scrim + dark ink over lighter
    // clips (see HeroSection), the inverse of the old dark scrim + white text.
    <div className="min-h-screen overflow-x-hidden bg-white text-dc-text">
      <SEO
        title="DragonCandy — AI-Powered Content for Businesses & Creators"
        description="DragonCandy connects local businesses, brands, and creators for short-form social media campaigns. Powered by Donny."
        path="/landing"
      />

      <Header />

      <main>
        <HeroSection />
        <DonnySection />
        <HowItWorks />
        <AudienceLanes />
        <ProofSection />
        <StartFreeSection />
      </main>

      <footer className="border-t border-dc-text/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-sm sm:px-8 lg:px-12">
          <img src="/logo.webp" alt="DragonCandy" className="h-6 w-auto opacity-90" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/privacy" className="text-dc-text-muted transition-colors hover:text-dc-teal">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-dc-text-muted transition-colors hover:text-dc-teal">
              Terms of Service
            </Link>
            <Link to="/help" className="text-dc-text-muted transition-colors hover:text-dc-teal">
              Help Center
            </Link>
          </nav>
          <p className="text-xs text-dc-text-muted/70">© 2026 DragonCandy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
