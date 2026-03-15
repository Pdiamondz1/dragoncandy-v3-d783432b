
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { CreatorPortfolioFeed } from "@/components/landing/CreatorPortfolioFeed";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-white relative">
      {/* Creator Portfolio Feed - Behind main content */}
      <CreatorPortfolioFeed />

      {/* Main content — mobile-first, centered column */}
      <div className="relative z-10 max-w-md mx-auto px-4">
        <Header />

        <main className="py-8">
          <HeroSection />
          <FeatureSection />
          <BottomCTA />
        </main>
      </div>
    </div>
  );
}
