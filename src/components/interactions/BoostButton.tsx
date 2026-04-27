import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface BoostButtonProps {
  tier: string;
  amount: string;
  onBoost: () => void;
  boosted?: boolean;
}

export function BoostButton({ tier, amount, onBoost, boosted }: BoostButtonProps) {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();

  const handleClick = () => {
    setPressed(true);
    onBoost();
    setTimeout(() => setPressed(false), 600);
  };

  if (boosted) {
    return (
      <div className="flex-1 h-10 rounded-full bg-dc-teal/10 border border-dc-teal text-dc-teal text-sm font-semibold flex items-center justify-center gap-1">
        <Zap className="h-3.5 w-3.5 fill-dc-teal" />
        Boosted
      </div>
    );
  }

  return (
    <motion.div
      className="flex-1"
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      animate={
        pressed && !reducedMotion
          ? { y: -2, transition: { duration: 0.15 } }
          : { y: 0 }
      }
    >
      <Button
        variant="dc-outline"
        className="w-full text-sm"
        onClick={handleClick}
      >
        {tier} · {amount}
      </Button>
    </motion.div>
  );
}
