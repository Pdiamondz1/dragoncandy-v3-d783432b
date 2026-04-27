import { Link } from "react-router-dom";
import { Upload, Zap, DollarSign, Inbox, Star, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DragonShareExplainerProps {
  role: "creator" | "brand";
  collapsed?: boolean;
  onSubmit?: () => void;
}

const CREATOR_STEPS = [
  {
    icon: Upload,
    number: 1,
    text: "Post about your favorite brand on Instagram, TikTok, wherever. Like you already do.",
  },
  {
    icon: Zap,
    number: 2,
    text: "Paste the link here. Donny figures out who you mentioned and routes it to them.",
  },
  {
    icon: DollarSign,
    number: 3,
    text: "If they boost it, you get paid. No negotiation.",
  },
];

const BRAND_STEPS = [
  {
    icon: Inbox,
    number: 1,
    text: "Creators post about you organically. We catch those posts.",
  },
  {
    icon: Star,
    number: 2,
    text: "When a verified post lands, you'll see it in this inbox with Donny's recommended boost amount.",
  },
  {
    icon: CreditCard,
    number: 3,
    text: "Tap a tier ($25 / $50 / $100 / $250). The creator gets 80% via Stripe. You get a happy creator.",
  },
];

export function DragonShareExplainer({ role, collapsed, onSubmit }: DragonShareExplainerProps) {
  const steps = role === "creator" ? CREATOR_STEPS : BRAND_STEPS;

  if (collapsed) {
    return (
      <Link
        to="/help/dragonshare-creator"
        className="text-xs text-dc-teal hover:underline"
      >
        How DragonShare works
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-dc-teal/20 p-5 space-y-5 max-w-md mx-auto">
      <h3 className="text-base font-semibold text-dc-dark text-center">
        How DragonShare Works
      </h3>

      <div className="space-y-4">
        {steps.map((step) => (
          <div key={step.number} className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-dc-teal/10 flex items-center justify-center">
              <step.icon className="w-4 h-4 text-dc-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wider">
                Step {step.number}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed mt-0.5">
                {step.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 space-y-2">
        {role === "creator" ? (
          <Button variant="dc-primary" className="w-full" onClick={onSubmit}>
            Submit your first post
          </Button>
        ) : (
          <p className="text-center text-sm text-gray-500">
            When you have your first post, the boost happens here.
          </p>
        )}

        <p className="text-center">
          <Link
            to={`/help/${role === "creator" ? "dragonshare-creator" : "dragonshare-brand"}`}
            className="text-xs text-gray-400 hover:text-dc-teal transition-colors"
          >
            Want details? Read how DragonShare works
          </Link>
        </p>
      </div>
    </div>
  );
}
