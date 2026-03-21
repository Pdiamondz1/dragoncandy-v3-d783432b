
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center mt-12 md:mt-20 lg:mt-28 mb-12 lg:mb-20 bg-gradient-to-br from-white via-white to-dc-teal/5 rounded-3xl p-6 md:p-10 lg:p-16 shadow-card-elevated border border-dc-teal/20 hover:shadow-glow-teal hover:border-dc-teal/40 transition-all duration-500">
      <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold text-[#111111] mb-4 md:mb-6 tracking-tight">
        Complete Content Creation
        <br className="hidden lg:block" />
        <span className="text-gradient"> Platform</span>
      </h2>
      <p className="text-base md:text-lg lg:text-xl text-[#555555] mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed">
        From AI-powered editing to creator marketplace and campaign management,
        everything you need to create amazing content in one platform.
      </p>
      <Button
        className="w-full sm:w-auto sm:px-10 rounded-full bg-dc-teal text-white font-bold py-3 text-base lg:text-lg hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300 group"
        onClick={() => navigate('/auth')}
      >
        Get Started Free
        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
};
