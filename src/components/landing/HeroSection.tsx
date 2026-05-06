import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-8 md:py-16 lg:py-24 animate-fade-in-up bg-gradient-to-b from-white to-gray-50">
      <h2 className="text-2xl md:text-4xl lg:text-6xl font-extrabold uppercase tracking-wide text-dc-teal text-center mb-5 leading-tight animate-fade-in-up-delay-1">
        Social Media Content for Restaurants — Powered by AI
      </h2>

      <p className="text-base text-gray-500 text-center mt-4 mb-8 leading-relaxed max-w-sm md:max-w-lg mx-auto animate-fade-in-up-delay-2">
        DragonCandy connects restaurants and cafes with vetted content creators. Get mouth-watering food photos and reels in hours, not weeks.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-sm mx-auto animate-fade-in-up-delay-3">
        <Button
          className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Restaurant — Get Started
        </Button>
        <Button
          className="w-full h-12 rounded-full bg-dc-pink-accent text-white font-bold text-base hover:bg-pink-600 hover:shadow-lg transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Brand/Sponsor — Launch Campaigns
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 rounded-full bg-white text-dc-pink-accent font-semibold text-base border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Creator — Join the Marketplace
        </Button>
      </div>
    </div>
  );
};
