
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { CreatorPortfolioFeed } from "@/components/landing/CreatorPortfolioFeed";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background relative">
      {/* Creator Portfolio Feed - Behind main content */}
      <CreatorPortfolioFeed />
      
      {/* Main content with higher z-index and proper spacing for sidebars */}
      <div className="relative z-10 ml-40 lg:ml-64 mr-40 lg:mr-64">
        <Header />

        <main className="px-4 sm:px-6 lg:px-8 xl:px-12 py-16">
          <HeroSection />
          <FeatureSection />
          <BottomCTA />
        </main>
      </div>
    </div>
  );
}
