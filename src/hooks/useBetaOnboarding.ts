
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: string;
  order: number;
  is_optional: boolean;
  target_roles: string[] | null;
}

interface UserProgress {
  step_id: string;
  completed_at: string | null;
  skipped_at: string | null;
}

export const useBetaOnboarding = () => {
  const { user, profile } = useAuth();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({});
  const [loading, setLoading] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    const fetchOnboardingData = async () => {
      try {
        // Fetch onboarding steps
        const { data: stepsData, error: stepsError } = await supabase
          .from('onboarding_steps' as any)
          .select('*')
          .or(`target_roles.is.null,target_roles.cs.{${profile.role}}`)
          .order('order');

        if (stepsError) {
          console.error('Error fetching onboarding steps:', stepsError);
          return;
        }

        // Fetch user progress
        const { data: progressData, error: progressError } = await supabase
          .from('user_onboarding_progress' as any)
          .select('*')
          .eq('user_id', user.id);

        if (progressError) {
          console.error('Error fetching user progress:', progressError);
          return;
        }

        setSteps(stepsData || []);
        
        const progressMap: Record<string, UserProgress> = {};
        progressData?.forEach((progress: any) => {
          progressMap[progress.step_id] = progress;
        });
        setUserProgress(progressMap);

        // Find the first incomplete step
        const firstIncompleteIndex = (stepsData || []).findIndex(step => 
          !progressMap[step.id]?.completed_at
        );
        setCurrentStepIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);

      } catch (error) {
        console.error('Error in fetchOnboardingData:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOnboardingData();
  }, [user, profile]);

  const completeStep = async (stepId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_onboarding_progress' as any)
        .upsert({
          user_id: user.id,
          step_id: stepId,
          completed_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error completing step:', error);
        return false;
      }

      setUserProgress(prev => ({
        ...prev,
        [stepId]: {
          step_id: stepId,
          completed_at: new Date().toISOString(),
          skipped_at: null
        }
      }));

      return true;
    } catch (error) {
      console.error('Error completing step:', error);
      return false;
    }
  };

  const skipStep = async (stepId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_onboarding_progress' as any)
        .upsert({
          user_id: user.id,
          step_id: stepId,
          skipped_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error skipping step:', error);
        return false;
      }

      setUserProgress(prev => ({
        ...prev,
        [stepId]: {
          step_id: stepId,
          completed_at: null,
          skipped_at: new Date().toISOString()
        }
      }));

      return true;
    } catch (error) {
      console.error('Error skipping step:', error);
      return false;
    }
  };

  const getProgress = () => {
    const completedSteps = steps.filter(step => userProgress[step.id]?.completed_at).length;
    return {
      completed: completedSteps,
      total: steps.length,
      percentage: steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0
    };
  };

  const isStepCompleted = (stepId: string) => {
    return !!userProgress[stepId]?.completed_at;
  };

  const isStepSkipped = (stepId: string) => {
    return !!userProgress[stepId]?.skipped_at;
  };

  const getCurrentStep = () => {
    return steps[currentStepIndex] || null;
  };

  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  return {
    steps,
    userProgress,
    loading,
    currentStepIndex,
    completeStep,
    skipStep,
    getProgress,
    isStepCompleted,
    isStepSkipped,
    getCurrentStep,
    goToNextStep,
    goToPreviousStep,
    setCurrentStepIndex
  };
};
