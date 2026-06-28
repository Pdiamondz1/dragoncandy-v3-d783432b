import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { WhyDragonCandy } from "@/components/landing/WhyDragonCandy";
import { DonnySection } from "@/components/landing/DonnySection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AudienceLanes } from "@/components/landing/AudienceLanes";
import { StoriesSection } from "@/components/landing/StoriesSection";
import { DragonRewardsSection } from "@/components/landing/DragonRewardsSection";
import { CreatorHubSection } from "@/components/landing/CreatorHubSection";
import { LeadCaptureSection } from "@/components/landing/LeadCaptureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
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
    // Dark theme is scoped to this subtree only — `.dark` redefines the dark CSS
    // variables for everything inside, and `bg-dc-dark` pins the brand charcoal.
    // It never leaks into the authenticated app (next-themes writes only to <html>).
    <div className="dark min-h-screen overflow-x-hidden bg-dc-dark text-white">
      <SEO
        title="DragonCandy — AI-Powered Content for Businesses & Creators"
        description="DragonCandy connects local businesses, brands, and creators for short-form social media campaigns. Powered by Donny AI."
        path="/landing"
      />

      <Header />

      <main>
        <HeroSection />
        <WhyDragonCandy />
        <DonnySection />
        <HowItWorks />
        <AudienceLanes />
        <StoriesSection />
        <DragonRewardsSection />
        <CreatorHubSection />
        <LeadCaptureSection />
        <BottomCTA />
      </main>

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-sm sm:px-8 lg:px-12">
          <img src="/logo.webp" alt="DragonCandy" className="h-6 w-auto opacity-90" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/privacy" className="text-white/50 transition-colors hover:text-dc-teal">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-white/50 transition-colors hover:text-dc-teal">
              Terms of Service
            </Link>
            <Link to="/help" className="text-white/50 transition-colors hover:text-dc-teal">
              Help Center
            </Link>
          </nav>
          <p className="text-xs text-white/35">© 2026 DragonCandy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
