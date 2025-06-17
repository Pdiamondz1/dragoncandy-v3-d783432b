
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface OnboardingProgress {
  [stepId: string]: boolean;
}

export const useOnboardingProgress = () => {
  const { user } = useAuth();
  const [progress, setProgress] = useState<OnboardingProgress>({});
  const [isCompleted, setIsCompleted] = useState(false);

  const storageKey = `onboarding_progress_${user?.id}`;
  const completedKey = `onboarding_completed_${user?.id}`;

  useEffect(() => {
    if (user) {
      const savedProgress = localStorage.getItem(storageKey);
      const savedCompleted = localStorage.getItem(completedKey);
      
      if (savedProgress) {
        setProgress(JSON.parse(savedProgress));
      }
      
      if (savedCompleted) {
        setIsCompleted(JSON.parse(savedCompleted));
      }
    }
  }, [user, storageKey, completedKey]);

  const updateProgress = (stepId: string, completed: boolean) => {
    const newProgress = { ...progress, [stepId]: completed };
    setProgress(newProgress);
    
    if (user) {
      localStorage.setItem(storageKey, JSON.stringify(newProgress));
    }
  };

  const completeOnboarding = () => {
    setIsCompleted(true);
    if (user) {
      localStorage.setItem(completedKey, JSON.stringify(true));
    }
  };

  const resetOnboarding = () => {
    setProgress({});
    setIsCompleted(false);
    if (user) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(completedKey);
    }
  };

  return {
    progress,
    isCompleted,
    updateProgress,
    completeOnboarding,
    resetOnboarding
  };
};
