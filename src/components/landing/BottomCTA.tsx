
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center mt-12 md:mt-24 bg-white rounded-3xl p-6 md:p-10 lg:p-16 shadow-2xl border-2 border-dc-teal hover:shadow-3xl transition-all duration-500">
      <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-4 md:mb-6">
        Complete Content Creation Platform
      </h2>
      <p className="text-base md:text-xl text-[#555555] mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed">
        From AI-powered editing to creator marketplace and campaign management,
        everything you need to create amazing content in one platform.
      </p>
      <Button
        className="w-full rounded-full bg-dc-teal text-white font-bold py-3 text-base hover:bg-dc-teal-dark"
        onClick={() => navigate('/auth')}
      >
        Get Started Free →
      </Button>
    </div>
  );
};
