import { useState, useEffect } from "react";
import { motion, useReducedMotion, AnimatePresence } from "@/lib/motion";

const STEPS = [
  "Reading your menu",
  "Studying your tone",
  "Picking creators",
  "Drafting deliverables",
];

interface GenerateBriefProgressProps {
  isGenerating: boolean;
  onComplete?: () => void;
}

export function GenerateBriefProgress({
  isGenerating,
  onComplete,
}: GenerateBriefProgressProps) {
  const [activeStep, setActiveStep] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isGenerating) {
      setActiveStep(0);
      return;
    }

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= STEPS.length - 1) {
          clearInterval(interval);
          onComplete?.();
          return prev;
        }
        return prev + 1;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isGenerating, onComplete]);

  if (!isGenerating) return null;

  return (
    <div className="space-y-3 py-4">
      {STEPS.map((step, i) => (
        <AnimatePresence key={step}>
          {i <= activeStep && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: reducedMotion ? 0 : 0.1 }}
              className="flex items-center gap-3"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < activeStep
                    ? "bg-dc-teal text-white"
                    : i === activeStep
                    ? "bg-dc-teal/20 text-dc-teal animate-pulse"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {i < activeStep ? "✓" : i + 1}
              </div>
              <span
                className={`text-sm ${
                  i <= activeStep
                    ? "text-gray-900 font-medium"
                    : "text-gray-400"
                }`}
              >
                {step}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      ))}
    </div>
  );
}
