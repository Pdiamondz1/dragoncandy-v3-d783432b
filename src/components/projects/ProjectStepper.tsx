/* eslint-disable react-refresh/only-export-components */
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectStepperProps {
  currentStep: number;
  role: 'creator' | 'business';
  tierColor?: string;
  className?: string;
}

const CREATOR_STEPS = ['Brief', 'Started', 'Upload', 'Submit', 'Paid'];
const BUSINESS_STEPS = ['Paid', 'Creating', 'Review', 'Done'];

export function getCreatorStep(contentStatus: string | null, hasUploadedFiles: boolean): number {
  switch (contentStatus) {
    case 'approved':
    case 'auto_approved':
      return 4;
    case 'submitted':
      return 3;
    case 'revision_requested':
      return 2;
    case 'in_progress':
      return hasUploadedFiles ? 2 : 1;
    default:
      return 0;
  }
}

export function getBusinessStep(contentStatus: string | null): number {
  switch (contentStatus) {
    case 'approved':
    case 'auto_approved':
      return 3;
    case 'submitted':
    case 'revision_requested':
      return 2;
    case 'in_progress':
      return 1;
    default:
      return 0;
  }
}

export function ProjectStepper({
  currentStep,
  role,
  tierColor = '#4DD9C0',
  className,
}: ProjectStepperProps) {
  const steps = role === 'creator' ? CREATOR_STEPS : BUSINESS_STEPS;

  return (
    <div className={cn('bg-white rounded-2xl p-4', className)}>
      <div className="flex items-center justify-between">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={label} className="flex items-center flex-1">
              {/* Connecting line before step (except first) */}
              {index > 0 && (
                <div
                  className="h-0.5 flex-1"
                  style={{
                    backgroundColor: index <= currentStep ? '#4DD9C0' : '#E5E7EB',
                  }}
                />
              )}

              {/* Step circle + label */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    isCompleted && 'bg-[#4DD9C0] text-white',
                    !isCompleted && !isCurrent && 'bg-gray-200 text-gray-500'
                  )}
                  style={
                    isCurrent
                      ? {
                          backgroundColor: tierColor,
                          color: '#FFFFFF',
                          boxShadow: `0 0 0 3px ${tierColor}33`,
                        }
                      : undefined
                  }
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className="text-[10px] mt-1 font-semibold"
                  style={{
                    color: isCompleted
                      ? '#4DD9C0'
                      : isCurrent
                      ? tierColor
                      : '#9CA3AF',
                  }}
                >
                  {label}
                </span>
              </div>

              {/* Connecting line after step (except last) */}
              {index < steps.length - 1 && (
                <div
                  className="h-0.5 flex-1"
                  style={{
                    backgroundColor: index < currentStep ? '#4DD9C0' : '#E5E7EB',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
