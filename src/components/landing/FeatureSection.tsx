
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-dc-teal w-8 h-8" />,
    title: "AI-Powered Marketing",
    description: "Intelligent tools to create and optimize content campaigns automatically.",
  },
  {
    icon: <Users className="text-dc-teal w-8 h-8" />,
    title: "Creator Marketplace",
    description: "Connect with talented creators for professional content collaboration.",
  },
  {
    icon: <TrendingUp className="text-dc-teal w-8 h-8" />,
    title: "Campaign Management",
    description: "Manage campaigns, track performance, and optimize for maximum impact.",
  },
];

export const FeatureSection = () => {
  return (
    <div className="flex flex-col gap-4 mb-8">
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
