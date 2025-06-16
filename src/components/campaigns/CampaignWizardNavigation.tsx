
import React from 'react';
import { Button } from '@/components/ui/button';

interface CampaignWizardNavigationProps {
  currentStep: number;
  onBack: () => void;
  onNext?: () => void;
  showCreateButton?: boolean;
}

const CampaignWizardNavigation: React.FC<CampaignWizardNavigationProps> = ({
  currentStep,
  onBack,
  onNext,
  showCreateButton = false,
}) => {
  return (
    <div className="flex justify-between mt-8">
      <Button variant="outline" onClick={onBack}>
        {currentStep === 1 ? 'Back to Campaigns' : 'Previous Step'}
      </Button>
      
      {showCreateButton && (
        <Button onClick={onNext} disabled={currentStep >= 5}>
          Create Campaign
        </Button>
      )}
    </div>
  );
};

export default CampaignWizardNavigation;
