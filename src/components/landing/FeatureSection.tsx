import { Sparkles, Users, Zap } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const features = [
  {
    icon: <Sparkles className="text-dc-teal w-6 h-6" />,
    title: "AI-Powered Campaigns",
    description:
      "Donny generates complete campaign briefs from your website URL. Target audience, content style, posting schedule — all automated.",
  },
  {
    icon: <Users className="text-dc-teal w-6 h-6" />,
    title: "Vetted Creator Network",
    description:
      "Every creator is scored on engagement, reliability, and content quality. No guesswork.",
  },
  {
    icon: <Zap className="text-dc-teal w-6 h-6" />,
    title: "DragonDash Rush Delivery",
    description:
      "Need content today? DragonDash connects you with available creators for same-day turnaround.",
  },
];

export const FeatureSection = () => {
  return (
    <div id="features" className="mb-8 animate-fade-in-up-delay-3">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-[#111111] text-center mb-2">
        Why DragonCandy
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12">
        Everything you need to get great content, fast
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </div>
  );
};
