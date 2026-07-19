import { motion } from '@/lib/motion';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  accentColor: 'teal' | 'pink';
}

export function OnboardingProgress({ currentStep, totalSteps }: OnboardingProgressProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        const isComplete = i < currentStep;

        return (
          <motion.div
            key={i}
            layout
            className={`h-2 rounded-full transition-colors duration-300 ${
              isActive
                ? 'bg-landing-pink'
                : isComplete
                  ? 'bg-landing-pink opacity-60'
                  : 'bg-landing-line'
            }`}
            animate={{
              width: isActive ? 32 : 10,
              scale: isActive ? 1 : 0.9,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        );
      })}
    </div>
  );
}
