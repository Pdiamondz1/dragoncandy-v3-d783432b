import { PROJECT_STEPS, type ProjectStep, getStepIndex } from '@/lib/campaignPhase';

interface CampaignProgressBarProps {
  currentStep: ProjectStep;
  className?: string;
}

export function CampaignProgressBar({ currentStep, className = '' }: CampaignProgressBarProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className={`flex gap-1 ${className}`}>
      {PROJECT_STEPS.map((step, i) => {
        let color = 'bg-dc-teal/15';
        if (i < currentIndex) color = 'bg-teal-400';
        else if (i === currentIndex) color = 'bg-yellow-400';
        return (
          <div key={step.key} className={`flex-1 h-1 rounded-full ${color}`} />
        );
      })}
    </div>
  );
}
