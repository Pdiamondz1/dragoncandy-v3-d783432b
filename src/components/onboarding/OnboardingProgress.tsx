import { motion } from '@/lib/motion';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  accentColor: 'teal' | 'pink';
}

/**
 * `accentColor` used to be declared, passed by the wizard, and then never read — every
 * role's progress rendered pink, including creators, whose accent is teal everywhere
 * else in the same screen. A prop that is threaded through and dropped looks like a
 * supported option from every call site.
 */
export function OnboardingProgress({ currentStep, totalSteps, accentColor }: OnboardingProgressProps) {
  const fill = accentColor === 'teal' ? 'bg-dc-teal' : 'bg-dc-pink-accent-btn';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const isActive = i === currentStep;
          const isComplete = i < currentStep;

          return (
            <motion.div
              key={i}
              layout
              className={`h-2 rounded-full transition-colors duration-300 ${
                isActive ? fill : isComplete ? `${fill} opacity-60` : 'bg-dc-teal/15'
              }`}
              animate={{ width: isActive ? 32 : 10, scale: isActive ? 1 : 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          );
        })}
      </div>
      {/*
        Dots alone answer "how far" but not "how much left" once there are six of them.
        The count is also the accessible reading of the bar, which is otherwise a row of
        unlabelled divs.
      */}
      <p className="text-[11px] font-medium text-dc-text-muted" aria-live="polite">
        Step {Math.min(currentStep + 1, totalSteps)} of {totalSteps}
      </p>
    </div>
  );
}
