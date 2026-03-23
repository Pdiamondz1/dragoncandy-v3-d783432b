
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { PortfolioStrip } from "@/components/landing/PortfolioStrip";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (!loading && user) {
      console.log('🔄 LandingPage: Authenticated user detected, redirecting to dashboard...');
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-white relative overflow-x-hidden">
      {/* Main content — mobile-first, scales up elegantly on desktop */}
      <div className="relative z-10 max-w-md md:max-w-2xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-8 lg:px-12">
        <Header />

        <main className="py-6 md:py-10 lg:py-12">
          <HeroSection />
          <FeatureSection />
          <BottomCTA />
        </main>
      </div>

      {/* Portfolio image strip — edge-to-edge at the bottom */}
      <PortfolioStrip />
    </div>
  );
}
