
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

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeatureSection />
        <BottomCTA />
        <CreatorPortfolioFeed />
      </main>
    </div>
  );
}
