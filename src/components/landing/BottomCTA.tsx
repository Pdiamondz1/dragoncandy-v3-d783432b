import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div id="cta" className="text-center mt-12 md:mt-20 lg:mt-28 mb-12 lg:mb-20 bg-gradient-to-br from-white via-white to-dc-teal/5 rounded-3xl p-6 md:p-10 lg:p-16 shadow-card-elevated border border-dc-teal/20 hover:shadow-glow-teal hover:border-dc-teal/40 transition-all duration-500">
      <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold text-dc-text mb-4 md:mb-6 tracking-tight">
        Ready to Get Started?
      </h2>
      <p className="text-base md:text-lg lg:text-xl text-dc-text-muted mb-8 md:mb-12 max-w-xl mx-auto leading-relaxed">
        Whether you're a restaurant, a brand, or a creator — DragonCandy has you covered.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-teal text-white font-bold py-3 text-base lg:text-lg hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Restaurant — Get Started
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-pink-accent text-white font-bold py-3 text-base lg:text-lg hover:bg-pink-600 hover:shadow-lg transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Brand/Sponsor — Launch Campaigns
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
        <Button
          variant="outline"
          className="w-full sm:w-auto sm:px-8 rounded-full bg-white text-dc-pink-accent font-semibold py-3 text-base lg:text-lg border border-gray-200 hover:border-dc-teal hover:text-dc-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          I'm a Creator — Join the Marketplace
        </Button>
      </div>
    </div>
  );
};
