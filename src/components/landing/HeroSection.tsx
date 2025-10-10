
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center">
      {/* Logo */}
      <div className="flex justify-center mb-10">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-32 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => navigate('/')} />
      </div>
      
      {/* Badge */}
      <span className="inline-block bg-pink-100 text-pink-600 rounded-2xl px-6 py-2 text-sm mb-10 font-semibold shadow-sm hover:shadow-md transition-shadow duration-300">
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
      <div className="flex flex-col sm:flex-row gap-6 justify-center mb-20">
        <Button
          size="lg"
          className="bg-pink-600 hover:bg-pink-700 text-white px-10 py-4 text-lg font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          onClick={() => navigate('/campaign/create')}
        >
          Start Your Campaign →
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="border-2 border-gray-300 text-gray-700 px-10 py-4 text-lg hover:bg-gray-50 rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105"
          onClick={() => navigate('/auth')}
        >
          Sign Up Free
        </Button>
      </div>
      
      {/* Trust Indicator */}
      <div className="text-center mb-8">
        <p className="text-sm text-gray-500">
          ✨ No signup required to start • Create campaigns instantly
        </p>
      </div>
    </div>
  );
};
