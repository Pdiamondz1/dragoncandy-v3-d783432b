
import React from 'react';

interface Step {
  number: number;
  title: string;
  active: boolean;
}

interface CampaignWizardHeaderProps {
  currentStep: number;
  steps: Step[];
}

export const CampaignWizardHeader: React.FC<CampaignWizardHeaderProps> = ({
  currentStep,
  steps,
}) => {
  return (
    <>
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Campaign Wizard</h2>
        <p className="text-gray-600">
          Let DragonCandy AI analyze your goals and create the perfect campaign structure
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide pb-1">
          <div className="flex items-center justify-center w-full px-1 gap-0">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center" style={{ width: '48px' }}>
                  <div className={`
                    w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-[11px] md:text-sm font-semibold
                    ${index < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                    }
                  `}>
                    {step.number}
                  </div>
                  <span className={`
                    text-[8px] md:text-xs mt-0.5 font-medium text-center leading-tight w-full truncate
                    ${index < currentStep ? 'text-primary' : 'text-muted-foreground'}
                  `}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    w-2 md:w-8 h-0.5
                    ${index < currentStep - 1 ? 'bg-primary' : 'bg-muted'}
                  `} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

    </>
  );
};

