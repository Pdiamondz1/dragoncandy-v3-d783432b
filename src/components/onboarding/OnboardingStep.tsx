
import React from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { ProfileTourStep } from './steps/ProfileTourStep';
import { CampaignCreationStep } from './steps/CampaignCreationStep';
import { CreatorDiscoveryStep } from './steps/CreatorDiscoveryStep';
import { MessagingStep } from './steps/MessagingStep';
import { CreatorProfileStep } from './steps/CreatorProfileStep';
import { CampaignBrowsingStep } from './steps/CampaignBrowsingStep';
import { ApplicationStep } from './steps/ApplicationStep';
import { ProjectManagementStep } from './steps/ProjectManagementStep';

interface OnboardingStepProps {
  stepId: string;
  stepComponent: string;
  userRole: 'business_client' | 'content_creator' | 'brand';
  onNext: () => void;
}

export const OnboardingStep: React.FC<OnboardingStepProps> = ({
  stepId,
  stepComponent,
  userRole,
  onNext
}) => {
  const stepProps = { stepId, userRole, onNext };

  switch (stepComponent) {
    case 'WelcomeStep':
      return <WelcomeStep {...stepProps} />;
    case 'ProfileTourStep':
      return <ProfileTourStep {...stepProps} />;
    case 'CampaignCreationStep':
      return <CampaignCreationStep {...stepProps} />;
    case 'CreatorDiscoveryStep':
      return <CreatorDiscoveryStep {...stepProps} />;
    case 'MessagingStep':
      return <MessagingStep {...stepProps} />;
    case 'CreatorProfileStep':
      return <CreatorProfileStep {...stepProps} />;
    case 'CampaignBrowsingStep':
      return <CampaignBrowsingStep {...stepProps} />;
    case 'ApplicationStep':
      return <ApplicationStep {...stepProps} />;
    case 'ProjectManagementStep':
      return <ProjectManagementStep {...stepProps} />;
    default:
      return <WelcomeStep {...stepProps} />;
  }
};
