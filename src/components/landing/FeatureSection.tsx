
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    title: "AI-Powered Marketing",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    title: "Creator Marketplace",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    title: "Campaign Management",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
];

export const FeatureSection = () => {
  return (
    <div className="px-4 pb-4">
      <div className="grid grid-cols-3 gap-3">
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            icon={null}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </div>
  );
};
