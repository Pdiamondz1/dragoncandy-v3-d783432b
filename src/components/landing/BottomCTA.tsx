
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center mt-20 bg-white rounded-2xl p-12 shadow-sm">
      <h2 className="text-3xl font-bold text-gray-900 mb-4">
        Complete Content Creation Platform
      </h2>
      <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
        From AI-powered editing to creator marketplace and campaign management,
        everything you need to create amazing content in one platform.
      </p>
      <Button
        size="lg"
        className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 text-lg font-semibold"
        onClick={() => navigate('/auth')}
      >
        Get Started Free →
      </Button>
    </div>
  );
};
