
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-pink-500 w-12 h-12" />,
    title: "AI-Powered Editing",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    icon: <Users className="text-pink-500 w-12 h-12" />,
    title: "Creator Marketplace",
    description: "Connect with talented creators for professional content collaboration.",
  },
  {
    icon: <TrendingUp className="text-pink-500 w-12 h-12" />,
    title: "Campaign Management",
    description: "Manage campaigns, track performance, and optimize for maximum impact.",
  },
];

export const FeatureSection = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {features.map((feature, index) => (
        <FeatureCard
          key={index}
          icon={feature.icon}
          title={feature.title}
          description={feature.description}
        />
      ))}
    </div>
  );
};
