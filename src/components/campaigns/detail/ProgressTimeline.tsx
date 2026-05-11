import React from 'react';
import { Button } from '@/components/ui/button';
import {
  PROJECT_STEPS,
  getStepIndex,
  type CampaignPhase,
  type ProjectStep,
} from '@/lib/campaignPhase';

interface ProgressTimelineProps {
  currentStep: ProjectStep | null;
  phase: CampaignPhase;
  onLeaveReview: () => void;
  onMarkComplete: () => void;
}

export const ProgressTimeline: React.FC<ProgressTimelineProps> = ({
  currentStep,
  phase,
  onLeaveReview,
  onMarkComplete,
}) => {
  if (phase === 'cancelled' || currentStep === null) return null;

  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="bg-white border-2 border-teal-400 rounded-2xl p-4 space-y-0">
      <h3 className="font-bold text-gray-900 text-sm mb-3">Project Progress</h3>
      <div className="space-y-3">
        {PROJECT_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent   = index === currentIndex;
          const isPending   = index > currentIndex;

          return (
            <div key={step.key} className="flex items-start gap-3">
              {/* Step indicator */}
              <div className="flex flex-col items-center shrink-0 pt-0.5">
                <span className="text-base leading-none">
                  {isCompleted ? '✅' : isCurrent ? '🟡' : '○'}
                </span>
                {index < PROJECT_STEPS.length - 1 && (
                  <div className={`w-0.5 h-5 mt-1 rounded-full ${isCompleted ? 'bg-teal-400' : 'bg-gray-200'}`} />
                )}
              </div>

              {/* Label + action */}
              <div className="flex-1 min-w-0 pb-1">
                <p className={`text-sm leading-tight ${
                  isCurrent  ? 'font-bold text-gray-900' :
                  isCompleted ? 'text-gray-500' :
                  'text-gray-400'
                }`}>
                  {step.label}
                </p>

                {isCurrent && step.key === 'review_left' && (
                  <Button
                    onClick={onLeaveReview}
                    size="sm"
                    className="mt-1.5 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold text-xs h-7"
                  >
                    Leave a Review →
                  </Button>
                )}

                {isCurrent && step.key === 'payment' && (
                  <Button
                    onClick={onMarkComplete}
                    size="sm"
                    className="mt-1.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs h-7"
                  >
                    Mark Complete →
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
