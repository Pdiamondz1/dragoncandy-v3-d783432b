
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { OnboardingStep } from './OnboardingStep';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';

interface OnboardingWizardProps {
  userRole: 'business_client' | 'content_creator' | 'brand';
  onComplete: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ userRole, onComplete }) => {
  const { profile } = useAuth();
  const { progress, updateProgress, completeOnboarding } = useOnboardingProgress();
  const [currentStep, setCurrentStep] = useState(0);

  const businessSteps = [
    {
      id: 'welcome',
      title: 'Welcome to DragonCandy',
      description: 'Get started with creating amazing campaigns',
      component: 'WelcomeStep'
    },
    {
      id: 'profile-tour',
      title: 'Complete Your Profile',
      description: 'Add business information to attract creators',
      component: 'ProfileTourStep'
    },
    {
      id: 'campaign-creation',
      title: 'Create Your First Campaign',
      description: 'Learn how to launch successful campaigns',
      component: 'CampaignCreationStep'
    },
    {
      id: 'creator-discovery',
      title: 'Discover Creators',
      description: 'Find the perfect creators for your brand',
      component: 'CreatorDiscoveryStep'
    },
    {
      id: 'messaging-collaboration',
      title: 'Messaging & Collaboration',
      description: 'Communicate effectively with creators',
      component: 'MessagingStep'
    }
  ];

  const creatorSteps = [
    {
      id: 'welcome',
      title: 'Welcome to DragonCandy',
      description: 'Start your journey as a content creator',
      component: 'WelcomeStep'
    },
    {
      id: 'profile-setup',
      title: 'Build Your Creator Profile',
      description: 'Showcase your skills and portfolio',
      component: 'CreatorProfileStep'
    },
    {
      id: 'campaign-browsing',
      title: 'Browse Campaigns',
      description: 'Find campaigns that match your skills',
      component: 'CampaignBrowsingStep'
    },
    {
      id: 'application-process',
      title: 'Apply to Campaigns',
      description: 'Learn how to create winning applications',
      component: 'ApplicationStep'
    },
    {
      id: 'project-management',
      title: 'Manage Projects',
      description: 'Deliver great work and build reputation',
      component: 'ProjectManagementStep'
    }
  ];

  const steps = userRole === 'business_client' || userRole === 'brand' ? businessSteps : creatorSteps;
  const progressPercentage = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      updateProgress(steps[nextStep].id, true);
    } else {
      completeOnboarding();
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-indigo-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
            <Sparkles className="text-pink-600 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to DragonCandy
          </h1>
          <p className="text-gray-600">
            Let's get you set up in just a few minutes
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(progressPercentage)}% Complete
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          
          {/* Step indicators */}
          <div className="flex justify-between mt-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index <= currentStep 
                    ? 'bg-pink-600 text-white' 
                    : 'bg-gray-200 text-gray-400'
                }`}>
                  {index < currentStep ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs text-gray-600 mt-1 max-w-20 text-center">
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Current Step Content */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{steps[currentStep].title}</CardTitle>
            <p className="text-gray-600">{steps[currentStep].description}</p>
          </CardHeader>
          <CardContent>
            <OnboardingStep 
              stepId={steps[currentStep].id}
              stepComponent={steps[currentStep].component}
              userRole={userRole}
              onNext={handleNext}
            />
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </Button>

          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700"
          >
            Skip Tutorial
          </Button>

          <Button
            onClick={handleNext}
            className="bg-pink-600 hover:bg-pink-700 flex items-center gap-2"
          >
            {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
