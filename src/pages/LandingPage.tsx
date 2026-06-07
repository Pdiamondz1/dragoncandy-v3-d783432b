
import { SEO } from "@/components/SEO";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
const BriefGeneratorPreview = lazy(() => import("@/components/landing/BriefGeneratorPreview").then(m => ({ default: m.BriefGeneratorPreview })));
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { BrandSection } from "@/components/landing/BrandSection";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-white relative overflow-x-hidden">
      <SEO
        title="DragonCandy - AI-Powered Marketplace for Brands & Creators"
        description="DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI."
        path="/landing"
      />
      <div className="relative z-10 max-w-md md:max-w-2xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-8 lg:px-12">
        <Header />

        <section className="py-6 md:py-10 lg:py-12">
          <HeroSection />
          <Suspense fallback={null}><BriefGeneratorPreview /></Suspense>
          <HowItWorks />
          <FeatureSection />
          {BRAND_ROLE_ENABLED && <BrandSection />}
          <BottomCTA />
        </section>

        <footer className="border-t border-dc-teal/15 py-8 mt-4">
          <div className="flex flex-col items-center gap-3 text-sm">
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Link to="/privacy" className="text-dc-text-muted hover:text-dc-teal transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-dc-text-muted hover:text-dc-teal transition-colors">
                Terms of Service
              </Link>
              <Link to="/help" className="text-dc-text-muted hover:text-dc-teal transition-colors">
                Help Center
              </Link>
            </nav>
            <p className="text-xs text-dc-text-muted">© 2026 DragonCandy. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
