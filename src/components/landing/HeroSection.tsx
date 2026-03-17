import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-6">
      <h1 className="text-4xl font-extrabold text-dc-teal uppercase leading-tight mb-4 tracking-tight">
        Unleash Your<br />Creativity
      </h1>

      <p className="text-base text-[#555555] mb-8 leading-relaxed">
        Connect with top creators, run AI-powered campaigns, and grow your brand — all in one place.
      </p>

      <div className="flex flex-col gap-3 mb-8">
        <Button
          className="w-full rounded-full bg-dc-teal text-white font-bold py-3 text-base hover:bg-dc-teal-dark"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full bg-white text-dc-pink-accent font-bold py-3 text-base border-2 border-gray-800 hover:bg-gray-50"
          onClick={() => navigate('/auth?mode=login')}
        >
          Learn More
        </Button>
      </div>
    </div>
  );
};
