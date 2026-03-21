
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-dc-teal w-6 h-6 lg:w-8 lg:h-8" />,
    title: "AI-Powered Marketing",
    description: "Intelligent tools to create and optimize content campaigns automatically.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6 lg:w-8 lg:h-8" />,
    title: "Creator Marketplace",
    description: "Connect with talented creators for professional content collaboration.",
  },
  {
    icon: <TrendingUp className="text-dc-teal w-6 h-6 lg:w-8 lg:h-8" />,
    title: "Campaign Management",
    description: "Manage campaigns, track performance, and optimize for maximum impact.",
  },
];

export const FeatureSection = () => {
  return (
    <div id="features" className="grid grid-cols-3 gap-3 md:gap-5 lg:gap-8 mb-8 lg:mb-16 animate-fade-in-up-delay-3">
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
