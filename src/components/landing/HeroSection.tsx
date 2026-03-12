
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center px-4 pt-8 pb-4">
      <h1 className="text-3xl font-bold uppercase text-teal-400 leading-tight mb-6">
        Unleash Your Creativity: Connect with Creators and Businesses with Dragon Candy
      </h1>

      <p className="text-base text-gray-900 font-semibold mb-8 max-w-sm mx-auto leading-relaxed">
        Connect with top creators, harness AI editing tools, and build campaigns that drive real results. DragonCandy makes professional content creation accessible to everyone.
      </p>

      <div className="flex flex-col gap-4 max-w-xs mx-auto mb-8">
        <Button
          className="w-full rounded-full bg-teal-400 hover:bg-teal-500 text-white font-bold text-base py-3"
          onClick={() => navigate('/campaign/create')}
        >
          Get Started
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full border-2 border-gray-900 text-pink-600 font-semibold text-base py-3 bg-white hover:bg-gray-50"
          onClick={() => navigate('/auth')}
        >
          Learn More
        </Button>
      </div>
    </div>
  );
};
