
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
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                  ${step.number <= currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                  }
                `}>
                  {step.number}
                </div>
                <span className={`
                  text-xs mt-1 font-medium
                  ${step.number <= currentStep ? 'text-blue-600' : 'text-gray-500'}
                `}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`
                  w-8 h-0.5 ml-4
                  ${step.number < currentStep ? 'bg-blue-600' : 'bg-gray-200'}
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
