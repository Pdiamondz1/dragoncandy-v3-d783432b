
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import OnboardingWizard from './OnboardingWizard';
import { HelpCircle } from 'lucide-react';

interface OnboardingTriggerProps {
  variant?: 'button' | 'banner';
  className?: string;
}

export const OnboardingTrigger: React.FC<OnboardingTriggerProps> = ({ 
  variant = 'button',
  className = ''
}) => {
  const { profile } = useAuth();
  const { isCompleted, resetOnboarding } = useOnboardingProgress();
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (!profile) return null;

  const handleStartOnboarding = () => {
    setShowOnboarding(true);
  };

  const handleCompleteOnboarding = () => {
    setShowOnboarding(false);
  };

  if (variant === 'banner' && !isCompleted) {
    return (
      <>
        <div className={`bg-gradient-to-r from-pink-600 to-indigo-600 text-white p-4 ${className}`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Welcome to DragonCandy!</h3>
              <p className="text-sm opacity-90">
                Take our quick 5-minute tour to get the most out of the platform
              </p>
            </div>
            <Button 
              onClick={handleStartOnboarding}
              variant="secondary"
              size="sm"
            >
              Start Tour
            </Button>
          </div>
        </div>

        <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
            <OnboardingWizard
              userRole={profile.role}
              onComplete={handleCompleteOnboarding}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStartOnboarding}
        className={`flex items-center gap-2 ${className}`}
      >
        <HelpCircle className="w-4 h-4" />
        {isCompleted ? 'Retake Tour' : 'Help & Tour'}
      </Button>

      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
          <OnboardingWizard
            userRole={profile.role}
            onComplete={handleCompleteOnboarding}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
