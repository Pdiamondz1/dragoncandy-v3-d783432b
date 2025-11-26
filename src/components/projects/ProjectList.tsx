
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Briefcase, 
  Calendar,
  DollarSign, 
  MessageSquare,
  CheckCircle2,
  Clock
} from 'lucide-react';
import ProjectFileUpload from '@/components/projects/ProjectFileUpload';
import { useProjectComplete } from '@/hooks/useProjectComplete';

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
  campaigns: {
    title: string;
    description?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
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
  const formatCurrency = (min?: number, max?: number) => {
    if (!min && !max) return 'Not specified';
    if (min && max && min !== max) {
      return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    }
    return `$${(min || max || 0).toLocaleString()}`;
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

  const getCompletionStatus = (project: ProjectCollaboration) => {
    if (project.status === 'completed') {
      return { text: 'Project Completed', icon: CheckCircle2, color: 'text-green-600' };
    }
    if (project.creator_completion_status === 'requested') {
      if (project.business_completion_status === 'requested') {
        return { text: 'Both approved - finalizing', icon: CheckCircle2, color: 'text-green-600' };
      }
      return { text: 'Waiting for business approval', icon: Clock, color: 'text-amber-600' };
    }
    return null;
  };

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">
                  {project.campaigns.title}
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Started {formatDate(project.created_at)}
                </p>
              </div>
              <Badge className={getStatusColor(project.status)}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {project.campaigns.description && (
              <p className="text-sm text-gray-600">
                {project.campaigns.description}
              </p>
            )}

            {showProgress && project.status === 'active' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm text-gray-500">{getProjectProgress(project)}%</span>
                </div>
                <Progress value={getProjectProgress(project)} className="h-2" />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-500">Deadline</p>
                  <p className="text-sm font-medium">{formatDate(project.campaigns.deadline)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-gray-500">Budget</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(project.campaigns.budget_min, project.campaigns.budget_max)}
                  </p>
                </div>
              </div>
            </div>

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

            {/* Completion Status */}
            {getCompletionStatus(project) && (
              <div className={`flex items-center gap-2 text-sm ${getCompletionStatus(project)!.color} mb-4`}>
                {(() => {
                  const StatusIcon = getCompletionStatus(project)!.icon;
                  return <StatusIcon className="h-4 w-4" />;
                })()}
                <span>{getCompletionStatus(project)!.text}</span>
              </div>
            )}

            {project.status === 'active' && (
              <div className="flex gap-2 pt-4 border-t">
                {(!project.creator_completion_status || project.creator_completion_status === 'pending') && (
                  <Button
                    onClick={() => handleMarkComplete(project.id)}
                    disabled={requestingId === project.id}
                    variant="default"
                    size="sm"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Complete
                  </Button>
                )}
                <ProjectFileUpload
                  campaignId={project.campaign_id}
                  campaignTitle={project.campaigns.title}
                  onUploadComplete={() => {
                    console.log('Upload completed for campaign:', project.campaign_id);
                  }}
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ProjectList;
