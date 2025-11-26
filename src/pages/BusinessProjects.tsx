
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MessageCircle, User, Calendar, FileText, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { useNavigate } from 'react-router-dom';
import { useFileUploads } from '@/hooks/useFileUploads';
import { formatFileSize } from '@/lib/fileUtils';

interface ProjectCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: string;
  business_completion_status?: string;
  creator_completion_status?: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  campaign: {
    id: string;
    title: string;
    description: string;
    status: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
  creator_profile: {
    creator_name?: string;
    avatar_url?: string;
    bio?: string;
  } | null;
  user_profile: {
    id: string;
    full_name?: string;
    email: string;
  } | null;
}

const BusinessProjects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const { requestCompletion, isRequesting } = useProjectComplete();

  // Fetch all collaborations for campaigns owned by this business
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['business-projects', user?.id],
    queryFn: async () => {
      if (!user) return [];

      console.log('Fetching business projects for user:', user.id);

      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          campaign_id,
          creator_id,
          status,
          created_at,
          updated_at,
          campaigns!inner (
            id,
            title,
            description,
            status,
            deadline,
            budget_min,
            budget_max,
            user_id
          )
        `)
        .eq('campaigns.user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching business projects:', error);
        throw error;
      }

      console.log('Raw business projects data:', data);

      if (!data || data.length === 0) {
        return [];
      }

      // Get creator profiles and user profiles for each collaboration
      const creatorIds = data.map(item => item.creator_id).filter(Boolean);
      const [{ data: creatorProfiles }, { data: userProfiles }] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('user_id, creator_name, avatar_url, bio')
          .in('user_id', creatorIds),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds)
      ]);

      // Transform the data to match our interface
      return data.map(item => ({
        id: item.id,
        campaign_id: item.campaign_id,
        creator_id: item.creator_id,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        campaign: Array.isArray(item.campaigns) ? item.campaigns[0] : item.campaigns,
        creator_profile: creatorProfiles?.find(cp => cp.user_id === item.creator_id) || null,
        user_profile: userProfiles?.find(up => up.id === item.creator_id) || null
      })).filter(item => item.campaign) as ProjectCollaboration[];
    },
    enabled: !!user,
  });

  // Fetch files for selected project
  const { data: projectFiles } = useFileUploads(selectedProject || undefined, 'deliverable');

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'completed': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const handleDownloadFile = async (file: any) => {
    setDownloadingFileId(file.id);
    try {
      const { data } = await supabase.storage
        .from(file.bucket_name)
        .download(file.file_path);

      if (data) {
        // Create blob URL for download
        const url = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.original_filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleMessageCreator = (campaignId: string) => {
    navigate(`/messages/${campaignId}?from=business-projects`);
  };

  const handleMarkComplete = (collaborationId: string) => {
    requestCompletion({ 
      collaborationId, 
      userRole: 'business_client' 
    });
  };

  const getCompletionStatus = (project: ProjectCollaboration) => {
    if (project.status === 'completed') {
      return { text: 'Project Completed', icon: CheckCircle2, color: 'text-green-600' };
    }
    if (project.business_completion_status === 'requested') {
      if (project.creator_completion_status === 'requested') {
        return { text: 'Both approved - finalizing', icon: CheckCircle2, color: 'text-green-600' };
      }
      return { text: 'Waiting for creator approval', icon: Clock, color: 'text-amber-600' };
    }
    return null;
  };

  if (projectsLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">My Projects</h1>
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-gray-200 rounded mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">My Projects</h1>
          <div className="text-sm text-gray-600">
            {projects?.length || 0} active project{projects?.length !== 1 ? 's' : ''}
          </div>
        </div>

        {!projects || projects.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">No Projects Yet</h3>
              <p className="text-gray-600 mb-4">
                Once creators are assigned to your campaigns, they'll appear here.
              </p>
              <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                View My Campaigns
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {projects.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <CardTitle className="text-xl">{project.campaign.title}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {project.creator_profile?.creator_name || 
                             project.user_profile?.full_name || 
                             project.user_profile?.email || 'Creator'}
                          </div>
                          {project.campaign.deadline && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Due: {new Date(project.campaign.deadline).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant={getStatusBadgeVariant(project.status)}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4">{project.campaign.description}</p>
                    
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

                    <div className="flex gap-2">
                      {project.status === 'active' && (!project.business_completion_status || project.business_completion_status === 'pending') && (
                        <Button
                          onClick={() => handleMarkComplete(project.id)}
                          disabled={isRequesting}
                          variant="default"
                          size="sm"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark Complete
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          console.log('Viewing files for project:', project.campaign_id);
                          setSelectedProject(project.campaign_id);
                          setActiveTab('deliverables');
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Files
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMessageCreator(project.campaign_id)}
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Message Creator
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="deliverables" className="space-y-4">
              {selectedProject ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Project Deliverables</h3>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedProject(null)}
                    >
                      Show All Projects
                    </Button>
                  </div>
                  
                  {projectFiles && projectFiles.length > 0 ? (
                    <div className="grid gap-4">
                      {projectFiles.map((file) => (
                        <Card key={file.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <h4 className="font-medium">{file.original_filename}</h4>
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  <span>{formatFileSize(file.file_size)}</span>
                                  <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                                  {file.uploader_profile?.full_name && (
                                    <span>by {file.uploader_profile.full_name}</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleDownloadFile(file)}
                                disabled={downloadingFileId === file.id}
                              >
                                {downloadingFileId === file.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4 mr-2" />
                                )}
                                {downloadingFileId === file.id ? 'Downloading...' : 'Download'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600">No deliverables uploaded yet for this project.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-600">Select a project to view its deliverables.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BusinessProjects;
