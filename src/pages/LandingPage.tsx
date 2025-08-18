
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { CreatorPortfolioFeed } from "@/components/landing/CreatorPortfolioFeed";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Creator Portfolio Feed - Behind main content */}
      <CreatorPortfolioFeed />
      
      {/* Main content with higher z-index */}
      <div className="relative z-10">
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-16">
          <HeroSection />
          <FeatureSection />
          <BottomCTA />
        </main>
      </div>
    </div>
  );
}
