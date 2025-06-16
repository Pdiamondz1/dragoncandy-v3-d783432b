
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center">
      {/* Badge */}
      <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-sm mb-8 font-semibold">
        🚀 AI-Powered Content Creation Platform
      </span>
      
      {/* Hero Heading */}
      <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
        Create Amazing Content<br />
        with <span className="text-pink-600">DragonCandy</span>
      </h1>
      
      {/* Hero Description */}
      <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
        Connect with top creators, harness AI editing tools, and build campaigns that drive real results. 
        DragonCandy makes professional content creation accessible to everyone.
      </p>
      
      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
        <Button
          size="lg"
          className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 text-lg font-semibold"
          onClick={() => navigate('/auth')}
        >
          Get Started Free →
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="border-gray-300 text-gray-700 px-8 py-3 text-lg hover:bg-gray-50"
        >
          Learn More
        </Button>
      </div>
    </div>
  );
};
