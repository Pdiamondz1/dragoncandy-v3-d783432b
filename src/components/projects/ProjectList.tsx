
import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Briefcase, 
  Calendar,
  DollarSign, 
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Zap,
  Star
} from 'lucide-react';
import ProjectFileUpload from '@/components/projects/ProjectFileUpload';
import ProjectTimerSection from '@/components/projects/ProjectTimerSection';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import RatingModal from '@/components/reviews/RatingModal';
import { supabase } from '@/integrations/supabase/client';

interface ProjectCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  contract_details?: any;
  milestones?: any;
  deliverables_status?: any;
  business_completion_status?: string;
  creator_completion_status?: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  // DragonDash timer fields
  content_started_at?: string | null;
  content_deadline?: string | null;
  content_status?: string | null;
  campaigns: {
    title: string;
    description?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    fixed_price?: number;
    pricing_type?: string;
    delivery_type?: string;
    deliverables?: string[];
  };
}

interface ProjectListProps {
  projects: ProjectCollaboration[];
  showProgress: boolean;
  onMessageClick: (campaignId: string) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, showProgress, onMessageClick }) => {
  const { requestCompletion, requestingId } = useProjectComplete();
  const [searchParams] = useSearchParams();
  const highlightedProjectId = searchParams.get('highlight');
  const highlightedRef = useRef<HTMLDivElement>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{
    collaborationId: string;
    revieweeId: string;
    revieweeName: string;
    businessUserId: string;
  } | null>(null);

  // Auto-scroll to highlighted project
  useEffect(() => {
    if (highlightedProjectId && highlightedRef.current) {
      setTimeout(() => {
        highlightedRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [highlightedProjectId]);
  const formatBudget = (campaign: ProjectCollaboration['campaigns']) => {
    if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
      return `$${campaign.fixed_price.toLocaleString()} Fixed`;
    }
    if (!campaign.budget_min && !campaign.budget_max) return 'Not specified';
    if (campaign.budget_min && campaign.budget_max && campaign.budget_min !== campaign.budget_max) {
      return `$${campaign.budget_min.toLocaleString()} - $${campaign.budget_max.toLocaleString()}`;
    }
    return `$${(campaign.budget_min || campaign.budget_max || 0).toLocaleString()}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No deadline';
    return new Date(dateString).toLocaleDateString();
  };

  const getProjectProgress = (project: ProjectCollaboration) => {
    if (project.status === 'completed') return 100;
    if (project.status === 'cancelled') return 0;
    
    const createdDate = new Date(project.created_at);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return Math.min(Math.floor((daysSinceStart / 30) * 100), 90);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleMarkComplete = (collaborationId: string) => {
    requestCompletion({ 
      collaborationId, 
      userRole: 'content_creator' 
    });
  };

  const handleLeaveReview = async (project: ProjectCollaboration) => {
    // Fetch business user ID from campaign
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', project.campaign_id)
      .single();
    
    if (!campaignData) return;

    // Fetch business profile for display name
    const { data: businessProfile } = await supabase
      .from('business_profiles')
      .select('business_name, user_id')
      .eq('user_id', campaignData.user_id)
      .single();

    setSelectedReview({
      collaborationId: project.id,
      revieweeId: campaignData.user_id,
      revieweeName: businessProfile?.business_name || 'Business',
      businessUserId: campaignData.user_id
    });
    setReviewModalOpen(true);
  };

  const getCompletionStatus = (project: ProjectCollaboration) => {
    if (project.status === 'completed') {
      return { text: '✅ Completed', variant: 'default' as const, showBadge: true };
    }
    if (project.business_completion_status === 'requested' && project.creator_completion_status !== 'requested') {
      return { text: '🔔 Awaiting Business Approval', variant: 'destructive' as const, showBadge: true };
    }
    if (project.creator_completion_status === 'requested' && project.business_completion_status !== 'requested') {
      return { text: '⏳ Waiting for Your Approval', variant: 'secondary' as const, showBadge: true };
    }
    if (project.business_completion_status === 'requested' && project.creator_completion_status === 'requested') {
      return { text: '✅ Both Approved', variant: 'default' as const, showBadge: true };
    }
    return { text: 'Active', variant: 'outline' as const, showBadge: false };
  };

  // Count projects needing approval from creator
  const projectsNeedingApproval = projects.filter(
    p => p.business_completion_status === 'requested' && p.creator_completion_status !== 'requested'
  );

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Briefcase className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No projects found
          </h3>
          <p className="text-gray-600">
            Complete applications to start working on campaigns.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Action Required Banner */}
      {projectsNeedingApproval.length > 0 && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20 mb-6">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-300 font-medium">
            <strong>{projectsNeedingApproval.length} project{projectsNeedingApproval.length !== 1 ? 's' : ''}</strong> {projectsNeedingApproval.length === 1 ? 'has' : 'have'} been marked complete by the business and need your approval.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projects.map((project) => {
          const isHighlighted = highlightedProjectId === project.id;
          const needsApproval = project.business_completion_status === 'requested' && 
                               project.creator_completion_status !== 'requested';
          const statusInfo = getCompletionStatus(project);

          return (
            <Card 
              key={project.id}
              ref={isHighlighted ? highlightedRef : null}
              className={cn(
                "transition-all duration-300",
                needsApproval && "border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
                isHighlighted && "ring-2 ring-amber-500 ring-offset-2"
              )}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">
                        {project.campaigns.title}
                      </CardTitle>
                      {needsApproval && (
                        <Badge variant="destructive" className="animate-pulse">
                          <Zap className="h-3 w-3 mr-1" />
                          Action Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Started {formatDate(project.created_at)}
                    </p>
                  </div>
                  {statusInfo.showBadge && (
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.text}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {project.campaigns.description && (
                  <p className="text-sm text-muted-foreground">
                    {project.campaigns.description}
                  </p>
                )}

                {showProgress && project.status === 'active' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-muted-foreground">{getProjectProgress(project)}%</span>
                    </div>
                    <Progress value={getProjectProgress(project)} className="h-2" />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Deadline</p>
                      <p className="text-sm font-medium">{formatDate(project.campaigns.deadline)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="text-sm font-medium">
                        {formatBudget(project.campaigns)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* DragonDash Timer Section */}
                {project.status === 'active' && project.campaigns.delivery_type && (
                  <ProjectTimerSection
                    collaborationId={project.id}
                    deliveryType={project.campaigns.delivery_type}
                  />
                )}

                {project.campaigns.deliverables && project.campaigns.deliverables.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Deliverables</h4>
                    <div className="flex flex-wrap gap-1">
                      {project.campaigns.deliverables.map((deliverable, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {deliverable}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {project.status === 'active' && (
                  <div className="flex gap-2 pt-4 border-t flex-wrap">
                    {needsApproval ? (
                      <Button
                        onClick={() => handleMarkComplete(project.id)}
                        disabled={requestingId === project.id}
                        variant="default"
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        {requestingId === project.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve & Complete
                          </>
                        )}
                      </Button>
                    ) : (!project.creator_completion_status || project.creator_completion_status === 'pending') && (
                      <Button
                        onClick={() => handleMarkComplete(project.id)}
                        disabled={requestingId === project.id}
                        variant="default"
                        size="sm"
                      >
                        {requestingId === project.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Completing...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Mark Complete
                          </>
                        )}
                      </Button>
                    )}
                    <ProjectFileUpload
                      campaignId={project.campaign_id}
                      campaignTitle={project.campaigns.title}
                      onUploadComplete={() => {}}
                    />
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => onMessageClick(project.campaign_id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                )}

                {project.status === 'completed' && (
                  <div className="flex gap-2 pt-4 border-t flex-wrap">
                    <Button
                      onClick={() => handleLeaveReview(project)}
                      variant="default"
                      size="sm"
                      className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Leave Review
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => onMessageClick(project.campaign_id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Rating Modal */}
      {selectedReview && (
        <RatingModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setSelectedReview(null);
          }}
          collaborationId={selectedReview.collaborationId}
          revieweeId={selectedReview.revieweeId}
          revieweeName={selectedReview.revieweeName}
          reviewType="creator_to_business"
        />
      )}
    </>
  );
};

export default ProjectList;
