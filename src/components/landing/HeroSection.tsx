import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-8 md:py-16 lg:py-24 animate-fade-in-up">
      <h1 className="text-2xl md:text-4xl lg:text-6xl font-extrabold uppercase tracking-wide text-dc-teal text-center mb-5 leading-tight animate-fade-in-up-delay-1">
        Unleash Your Creativity: Connect With Creators and Businesses With Dragon Candy
      </h1>

      <p className="text-base text-gray-500 text-center mt-4 mb-8 leading-relaxed max-w-sm mx-auto animate-fade-in-up-delay-2">
        Connect with top creators, harness AI editing tools, and build campaigns that drive real results. DragonCandy makes professional content creation accessible to everyone.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-sm mx-auto animate-fade-in-up-delay-3">
        <Button
          className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 rounded-full bg-white text-dc-pink-accent font-semibold text-base border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=login')}
        >
          Learn More
        </Button>
      </div>
    </div>
  );
};
