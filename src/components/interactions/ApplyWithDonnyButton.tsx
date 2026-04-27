import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { Coachmark } from "@/components/guidance/Coachmark";

interface ApplyWithDonnyButtonProps {
  onApply: () => Promise<void>;
  disabled?: boolean;
}

type ApplyState = "idle" | "generating" | "success";

export function ApplyWithDonnyButton({ onApply, disabled }: ApplyWithDonnyButtonProps) {
  const [state, setState] = useState<ApplyState>("idle");
  const reducedMotion = useReducedMotion();

  const handleClick = async () => {
    setState("generating");
    try {
      await onApply();
      setState("success");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
    }
  };

  if (state === "success") {
    return (
      <motion.div
        className="w-full flex items-center justify-center gap-2 h-12 rounded-full bg-dc-teal text-white font-semibold"
        initial={reducedMotion ? false : { scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Check className="h-5 w-5" />
        Applied!
      </motion.div>
    );
  }

  return (
    <Coachmark coachmarkKey="apply_with_donny" title="One tap to apply" body="Donny pre-fills everything. Just review and send.">
      <motion.div
        whileTap={reducedMotion ? undefined : { scale: 0.98, y: 2 }}
        transition={{ duration: 0.05 }}
        className="w-full"
      >
        <Button
          variant="dc-primary"
          className="w-full"
          onClick={handleClick}
          disabled={disabled || state === "generating"}
          isLoading={state === "generating"}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          {state === "generating" ? "Donny is writing..." : "Apply with Donny"}
        </Button>
      </motion.div>
    </Coachmark>
  );
}
