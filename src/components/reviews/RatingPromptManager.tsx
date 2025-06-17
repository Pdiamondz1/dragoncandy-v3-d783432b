
import React, { useState, useEffect } from 'react';
import { useProjectCompletion } from '@/hooks/useProjectCompletion';
import { useAuth } from '@/hooks/useAuth';
import RatingPrompt from './RatingPrompt';

const RatingPromptManager: React.FC = () => {
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
    project.review_status === 'pending' && 
    !dismissedPrompts.has(project.id)
  );

  if (pendingReviews.length === 0) return null;

  return (
    <div className="space-y-4">
      {pendingReviews.slice(0, 2).map((project) => {
        const isCreator = project.creator_id === user?.id;
        const revieweeId = isCreator ? project.campaigns.user_id : project.creator_id;
        const revieweeName = isCreator ? project.business?.full_name : project.creator?.full_name;
        const reviewType = isCreator ? 'creator_to_business' : 'business_to_creator';

        return (
          <RatingPrompt
            key={project.id}
            collaborationId={project.id}
            revieweeId={revieweeId}
            revieweeName={revieweeName || 'Unknown'}
            reviewType={reviewType}
            onDismiss={() => handleDismiss(project.id)}
          />
        );
      })}
    </div>
  );
};

export default RatingPromptManager;
