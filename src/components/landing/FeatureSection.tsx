
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-dc-teal w-6 h-6" />,
    title: "AI-Powered Marketing",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6" />,
    title: "Creator Marketplace",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    icon: <TrendingUp className="text-dc-teal w-6 h-6" />,
    title: "Campaign Management",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
];

export const FeatureSection = () => {
  return (
    <div id="features" className="grid grid-cols-3 gap-3 mb-8 animate-fade-in-up-delay-3">
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
