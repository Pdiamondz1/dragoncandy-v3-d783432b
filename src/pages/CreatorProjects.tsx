import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Briefcase, 
  Clock, 
  DollarSign, 
  Upload, 
  MessageSquare, 
  Calendar,
  CheckCircle,
  AlertCircle,
  User
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ProjectFileUpload from '@/components/projects/ProjectFileUpload';

interface ProjectCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  contract_details?: any;
  milestones?: any;
  deliverables_status?: any;
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

const CreatorProjects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['creator-projects', user?.id],
    queryFn: async () => {
      console.log('Fetching projects for creator:', user?.id);
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          *,
          campaigns!campaign_id (
            title,
            description,
            deadline,
            budget_min,
            budget_max,
            deliverables
          )
        `)
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        throw error;
      }

      console.log('Fetched projects:', data);
      return data as ProjectCollaboration[];
    },
    enabled: !!user,
  });

  const activeProjects = projects.filter(project => project.status === 'active');
  const completedProjects = projects.filter(project => project.status === 'completed');

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
    // Mock progress calculation - in real app this would be based on actual deliverables
    if (project.status === 'completed') return 100;
    if (project.status === 'cancelled') return 0;
    
    // For active projects, calculate based on milestones or time elapsed
    const createdDate = new Date(project.created_at);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Simple progress calculation based on days (assuming 30-day projects)
    return Math.min(Math.floor((daysSinceStart / 30) * 100), 90);
  };

  const handleMessageClick = (campaignId: string) => {
    navigate(`/messages?campaign=${campaignId}`);
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load projects
                </h3>
                <p className="text-gray-600">
                  There was an error loading your projects.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Projects</h1>
              <p className="text-gray-600">Manage your active campaigns and track deliverables</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Briefcase className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Active Projects</p>
                    <p className="text-2xl font-bold">{activeProjects.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="text-2xl font-bold">{completedProjects.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <DollarSign className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Earnings</p>
                    <p className="text-2xl font-bold">
                      {projects.length > 0 
                        ? formatCurrency(
                            projects.reduce((sum, project) => 
                              sum + (project.campaigns.budget_min || project.campaigns.budget_max || 0), 0
                            )
                          )
                        : '$0'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Projects Tabs */}
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active">Active ({activeProjects.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completedProjects.length})</TabsTrigger>
              <TabsTrigger value="all">All Projects ({projects.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <ProjectList 
                projects={activeProjects} 
                showProgress={true} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <ProjectList 
                projects={completedProjects} 
                showProgress={false} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="all" className="space-y-4">
              <ProjectList 
                projects={projects} 
                showProgress={true} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

const ProjectList: React.FC<{ 
  projects: ProjectCollaboration[]; 
  showProgress: boolean;
  onMessageClick: (campaignId: string) => void;
}> = ({ projects, showProgress, onMessageClick }) => {
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

            {project.status === 'active' && (
              <div className="flex gap-2 pt-4 border-t">
                <ProjectFileUpload
                  campaignId={project.campaign_id}
                  campaignTitle={project.campaigns.title}
                  onUploadComplete={() => {
                    // Optionally refresh data or show success message
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

export default CreatorProjects;
