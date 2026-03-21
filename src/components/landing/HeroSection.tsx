import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-10 md:py-16 lg:py-24 animate-fade-in-up">
      {/* Small badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-dc-teal/10 border border-dc-teal/20 mb-6 lg:mb-8 animate-fade-in-up-delay-1">
        <Sparkles className="h-3.5 w-3.5 text-dc-teal" />
        <span className="text-xs font-semibold text-dc-teal tracking-wide uppercase">
          AI-Powered Content Marketplace
        </span>
      </div>

      <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold uppercase leading-[1.1] mb-5 lg:mb-6 tracking-tight animate-fade-in-up-delay-1">
        <span className="text-gradient">Unleash Your</span>
        <br />
        <span className="text-[#111111]">Creativity</span>
      </h1>

      <p className="text-base md:text-lg lg:text-xl text-[#555555] mb-8 lg:mb-10 leading-relaxed max-w-xl lg:max-w-2xl mx-auto animate-fade-in-up-delay-2">
        Connect with top creators, run AI-powered campaigns, and grow your brand — all in one place.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md sm:max-w-lg mx-auto animate-fade-in-up-delay-3">
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-teal text-white font-bold py-3 text-base hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
        <Button
          variant="outline"
          className="w-full sm:w-auto sm:px-8 rounded-full bg-white text-dc-pink-accent font-bold py-3 text-base border-2 border-gray-200 hover:border-dc-teal hover:text-dc-teal hover:bg-dc-teal/5 transition-all duration-300"
          onClick={() => navigate('/auth?mode=login')}
        >
          Learn More
        </Button>
      </div>
    </div>
  );
};
