import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, BarChart3, Users, ArrowRight } from "lucide-react";

const brandFeatures = [
  {
    icon: <MapPin className="text-dc-teal w-6 h-6" />,
    title: "Multi-Location Campaigns",
    description: "Run coordinated creator campaigns across multiple cities and markets simultaneously.",
  },
  {
    icon: <BarChart3 className="text-dc-teal w-6 h-6" />,
    title: "Performance Analytics",
    description: "Track engagement, reach, and ROI across all your sponsored content in real time.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6" />,
    title: "Managed Creator Network",
    description: "Access vetted, rated creators matched to your brand by audience and content style.",
  },
];

export const BrandSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div id="brands" className="mb-8 md:mb-12">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-gray-900 text-center mb-2">
        For Brands & Sponsors
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12 max-w-lg mx-auto leading-relaxed">
        Scale your creator campaigns across local markets. AI-powered targeting, real-time analytics, and multi-location management.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        {brandFeatures.map((feature) => (
          <div
            key={feature.title}
            className="bg-gray-50 rounded-2xl p-4 flex flex-col items-center text-center gap-2 cursor-default"
          >
            <div className="mb-1 p-2 rounded-xl bg-dc-teal/10">
              {feature.icon}
            </div>
            <h3 className="text-sm font-bold text-gray-900 leading-tight">{feature.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <Button
          className="w-full sm:w-auto sm:px-8 rounded-full bg-dc-teal-btn text-white font-bold py-3 text-base hover:bg-dc-teal-btn-hover hover:shadow-glow-teal transition-all duration-300 group"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Launch Your First Campaign
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
};
