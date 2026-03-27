<<<<<<< HEAD

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
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Wizard</h1>
        <p className="text-gray-600">
          Let DragonCandy AI analyze your goals and create the perfect campaign structure
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide pb-1">
          <div className="flex items-center w-max px-1 gap-0">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center" style={{ width: '48px' }}>
                  <div className={`
                    w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-[11px] md:text-sm font-semibold
                    ${step.number <= currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                    }
                  `}>
                    {step.number}
                  </div>
                  <span className={`
                    text-[8px] md:text-xs mt-0.5 font-medium text-center leading-tight w-full truncate
                    ${step.number <= currentStep ? 'text-primary' : 'text-muted-foreground'}
                  `}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    w-2 md:w-8 h-0.5
                    ${step.number < currentStep ? 'bg-primary' : 'bg-muted'}
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

export default CampaignWizardHeader;
=======

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
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Wizard</h1>
        <p className="text-gray-600">
          Let DragonCandy AI analyze your goals and create the perfect campaign structure
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex justify-center mb-8 overflow-x-auto pb-1">
        <div className="flex items-center space-x-2 md:space-x-4 px-2">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`
                  w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold
                  ${step.number <= currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                  }
                `}>
                  {step.number}
                </div>
                <span className={`
                  text-[10px] md:text-xs mt-1 font-medium whitespace-nowrap
                  ${step.number <= currentStep ? 'text-primary' : 'text-muted-foreground'}
                `}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`
                  w-4 md:w-8 h-0.5 ml-2 md:ml-4
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
>>>>>>> a1eeecf (docs: add Donny Chrome Extension OAuth PKCE design spec)
