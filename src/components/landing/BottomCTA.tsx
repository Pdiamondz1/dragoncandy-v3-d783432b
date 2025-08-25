
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const BottomCTA = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center mt-24 bg-gradient-to-br from-white to-gray-50 rounded-3xl p-16 shadow-2xl border border-gray-100 hover:shadow-3xl transition-all duration-500">
      <h2 className="text-4xl font-bold text-gray-900 mb-6">
        Complete Content Creation Platform
      </h2>
      <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
        From AI-powered editing to creator marketplace and campaign management,
        everything you need to create amazing content in one platform.
      </p>
      <Button
        size="lg"
        className="bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white px-12 py-4 text-xl font-semibold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
        onClick={() => navigate('/auth')}
      >
        Get Started Free →
      </Button>
    </div>
  );
};
