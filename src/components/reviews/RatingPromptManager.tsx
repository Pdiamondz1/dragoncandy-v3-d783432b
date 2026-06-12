
import React, { useState, useEffect } from 'react';
import { useProjectCompletion } from '@/hooks/useProjectCompletion';
import { useAuth } from '@/hooks/useAuth';
import { RatingPrompt } from './RatingPrompt';

export const RatingPromptManager: React.FC<{ variant?: 'card' | 'row' }> = ({ variant = 'card' }) => {
  const { user } = useAuth();
  const { data: completedProjects, isLoading } = useProjectCompletion(user?.id);
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load dismissed prompts from localStorage
    const stored = localStorage.getItem('dismissedRatingPrompts');
    if (stored) {
      setDismissedPrompts(new Set(JSON.parse(stored)));
    }
  }, []);

  const handleDismiss = (collaborationId: string) => {
    const newDismissed = new Set(dismissedPrompts);
    newDismissed.add(collaborationId);
    setDismissedPrompts(newDismissed);
    localStorage.setItem('dismissedRatingPrompts', JSON.stringify([...newDismissed]));
  };

  if (isLoading || !completedProjects) return null;

  const pendingReviews = completedProjects.filter(project => 
    project.can_review && 
    !dismissedPrompts.has(project.id)
  );

  if (pendingReviews.length === 0) return null;

  return (
    <div className={variant === 'row' ? 'divide-y divide-dc-teal/10' : 'space-y-4'}>
      {pendingReviews.slice(0, 2).map((project) => {
        const reviewType = project.user_role === 'creator' ? 'creator_to_business' : 'business_to_creator';

        return (
          <RatingPrompt
            key={project.id}
            collaborationId={project.id}
            revieweeId={project.other_party_id}
            revieweeName={project.other_party_name}
            reviewType={reviewType}
            variant={variant}
            onDismiss={() => handleDismiss(project.id)}
          />
        );
      })}
    </div>
  );
};

