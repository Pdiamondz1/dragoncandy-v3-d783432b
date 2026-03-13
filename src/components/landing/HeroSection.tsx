
import { useNavigate } from "react-router-dom";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-6">
      {/* Hero Heading */}
      <h1 className="text-4xl font-extrabold text-dc-teal uppercase leading-tight mb-4 tracking-tight">
        Unleash Your<br />Creativity
      </h1>

      {/* Sub-copy */}
      <p className="text-base text-[#555555] mb-8 leading-relaxed">
        Connect with top creators, run AI-powered campaigns, and grow your brand — all in one place.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col gap-3 mb-8">
        <button
          className="w-full rounded-full bg-dc-teal text-white font-bold py-3 text-base shadow-md hover:bg-dc-teal-dark transition-colors"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </button>
        <button
          className="w-full rounded-full bg-white text-dc-pink-accent font-bold py-3 text-base border border-gray-300 hover:bg-gray-50 transition-colors"
          onClick={() => navigate('/auth?mode=login')}
        >
          Learn More
        </button>
      </div>
    </div>
  );
};
