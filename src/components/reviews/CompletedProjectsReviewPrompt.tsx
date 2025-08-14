import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useProjectCompletion } from '@/hooks/useProjectCompletion';
import RatingModal from './RatingModal';
import { Star, MessageSquare, Calendar } from 'lucide-react';

const CompletedProjectsReviewPrompt: React.FC = () => {
  const { user } = useAuth();
  const { data: completedProjects, isLoading } = useProjectCompletion(user?.id);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);

  const projectsNeedingReview = completedProjects?.filter(p => p.can_review) || [];

  if (isLoading || projectsNeedingReview.length === 0) {
    return null;
  }

  const handleReviewClick = (project: any) => {
    setSelectedProject(project);
    setIsRatingModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsRatingModalOpen(false);
    setSelectedProject(null);
  };

  return (
    <>
      <Card className="mb-6 border-yellow-200 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-800">
            <Star className="h-5 w-5" />
            Rate Your Recent Collaborations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-700 mb-4">
            You have {projectsNeedingReview.length} completed project{projectsNeedingReview.length !== 1 ? 's' : ''} waiting for your review.
          </p>
          
          <div className="space-y-3">
            {projectsNeedingReview.slice(0, 3).map((project) => (
              <div key={project.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{project.campaign_title}</h4>
                  <p className="text-sm text-gray-600">
                    Collaboration with {project.other_party_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {project.user_role === 'creator' ? 'As Creator' : 'As Business'}
                    </Badge>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Recently completed
                    </span>
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  onClick={() => handleReviewClick(project)}
                  className="ml-4"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Leave Review
                </Button>
              </div>
            ))}
            
            {projectsNeedingReview.length > 3 && (
              <p className="text-sm text-yellow-700 text-center">
                And {projectsNeedingReview.length - 3} more project{projectsNeedingReview.length - 3 !== 1 ? 's' : ''}...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedProject && (
        <RatingModal
          isOpen={isRatingModalOpen}
          onClose={handleCloseModal}
          collaborationId={selectedProject.id}
          revieweeId={selectedProject.other_party_id}
          revieweeName={selectedProject.other_party_name}
          reviewType={selectedProject.user_role === 'creator' ? 'creator_to_business' : 'business_to_creator'}
        />
      )}
    </>
  );
};

export default CompletedProjectsReviewPrompt;