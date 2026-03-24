
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

const CampaignWizardHeader: React.FC<CampaignWizardHeaderProps> = ({
  currentStep,
  steps,
}) => {
  return (
    <>
      {/* Header */}
      <div className="text-center mb-8 max-w-full overflow-hidden">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Wizard</h1>
        <p className="text-gray-600 break-words">
          Let DragonCandy AI analyze your goals and create the perfect campaign structure
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 overflow-x-auto pb-1 -mx-4 px-4">
        <div className="flex items-center justify-between min-w-0 gap-1">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center min-w-0">
              <div className="flex flex-col items-center min-w-0">
                <div className={`
                  w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold flex-shrink-0
                  ${step.number <= currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                  }
                `}>
                  {step.number}
                </div>
                <span className={`
                  text-[9px] md:text-xs mt-1 font-medium text-center leading-tight max-w-[56px] md:max-w-none truncate
                  ${step.number <= currentStep ? 'text-primary' : 'text-muted-foreground'}
                `}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`
                  w-3 md:w-8 h-0.5 mx-0.5 md:mx-2 flex-shrink-0
                  ${step.number < currentStep ? 'bg-primary' : 'bg-muted'}
                `} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default CampaignWizardHeader;
