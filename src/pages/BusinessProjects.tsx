
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, MessageCircle, User, Calendar, FileText, Loader2, CheckCircle2, Clock, AlertCircle, Zap, Star, DollarSign } from 'lucide-react';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFileUploads } from '@/hooks/useFileUploads';
import { formatFileSize } from '@/lib/fileUtils';
import { cn } from '@/lib/utils';
import RatingModal from '@/components/reviews/RatingModal';
import { useToast } from '@/hooks/use-toast';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedProjectId = searchParams.get('highlight');
  const paymentStatus = searchParams.get('payment');
  const paymentCampaignId = searchParams.get('campaign_id');
  const highlightedRef = useRef<HTMLDivElement>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const { requestCompletion, requestingId } = useProjectComplete();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{
    collaborationId: string;
    revieweeId: string;
    revieweeName: string;
  } | null>(null);

  // Handle payment verification on redirect from Stripe
  useEffect(() => {
    const verifyPayment = async () => {
      if (!paymentStatus || !paymentCampaignId || verifyingPayment) return;
      
      if (paymentStatus === 'success') {
        setVerifyingPayment(true);
        toast({
          title: 'Verifying payment...',
          description: 'Please wait while we confirm your escrow payment.',
        });
        
        try {
          const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
            body: { campaignId: paymentCampaignId },
          });
          
          if (error) throw error;
          
          if (data?.success) {
            toast({
              title: '🎉 Payment Confirmed!',
              description: 'Your campaign is now published and visible to creators.',
            });
            // Invalidate campaigns query to refresh the list
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
          } else {
            toast({
              variant: 'destructive',
              title: 'Payment Pending',
              description: data?.message || 'Payment not yet confirmed. You can retry from your campaigns page.',
            });
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          toast({
            variant: 'destructive',
            title: 'Verification Failed',
            description: 'Could not verify payment. Please check your campaigns page.',
          });
        } finally {
          setVerifyingPayment(false);
        }
      } else if (paymentStatus === 'cancelled') {
        toast({
          title: 'Payment Cancelled',
          description: 'Your campaign was saved as a draft. You can pay escrow later.',
        });
      }
      
      // Clean URL params after handling
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('payment');
        newParams.delete('campaign_id');
        return newParams;
      });
    };
    
    verifyPayment();
  }, [paymentStatus, paymentCampaignId]);

  // Fetch all collaborations for campaigns owned by this business
  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: ['business-projects', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          campaign_id,
          creator_id,
          status,
          business_completion_status,
          creator_completion_status,
          completed_at,
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
        business_completion_status: item.business_completion_status,
        creator_completion_status: item.creator_completion_status,
        completed_at: item.completed_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        campaign: Array.isArray(item.campaigns) ? item.campaigns[0] : item.campaigns,
        creator_profile: creatorProfiles?.find(cp => cp.user_id === item.creator_id) || null,
        user_profile: userProfiles?.find(up => up.id === item.creator_id) || null
      })).filter(item => item.campaign) as ProjectCollaboration[];
    },
    enabled: !!user,
  });

  // Auto-scroll to highlighted project
  useEffect(() => {
    if (highlightedProjectId && highlightedRef.current && projects) {
      setTimeout(() => {
        highlightedRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [highlightedProjectId, projects]);

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

  const handleLeaveReview = (project: ProjectCollaboration) => {
    setSelectedReview({
      collaborationId: project.id,
      revieweeId: project.creator_id,
      revieweeName: project.creator_profile?.creator_name || 
                    project.user_profile?.full_name || 
                    project.user_profile?.email || 'Creator'
    });
    setReviewModalOpen(true);
  };

  const getCompletionStatus = (project: ProjectCollaboration) => {
    if (project.status === 'completed') {
      return { text: '✅ Completed', variant: 'default' as const, showBadge: true };
    }
    if (project.creator_completion_status === 'requested' && project.business_completion_status !== 'requested') {
      return { text: '🔔 Awaiting Your Approval', variant: 'destructive' as const, showBadge: true };
    }
    if (project.business_completion_status === 'requested' && project.creator_completion_status !== 'requested') {
      return { text: '⏳ Waiting for Creator', variant: 'secondary' as const, showBadge: true };
    }
    if (project.business_completion_status === 'requested' && project.creator_completion_status === 'requested') {
      return { text: '✅ Both Approved', variant: 'default' as const, showBadge: true };
    }
    return { text: 'Active', variant: 'outline' as const, showBadge: false };
  };

  // Count projects needing approval
  const projectsNeedingApproval = projects?.filter(
    p => p.creator_completion_status === 'requested' && p.business_completion_status !== 'requested'
  ) || [];

  if (projectsLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="p-4 lg:p-6 max-w-full overflow-hidden space-y-6">
          <h1 className="text-3xl font-bold truncate">My Projects</h1>
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

  if (projectsError) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="p-4 lg:p-6 max-w-full overflow-hidden space-y-6">
          <h1 className="text-3xl font-bold truncate">My Projects</h1>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Unable to load your projects. Please refresh the page or try again later.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="p-4 lg:p-6 max-w-full overflow-hidden space-y-6">
        <div className="flex justify-between items-center gap-4 min-w-0">
          <h1 className="text-3xl font-bold truncate">My Projects</h1>
          <div className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0">
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
          <>
            {/* Action Required Banner */}
            {projectsNeedingApproval.length > 0 && (
              <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-300 font-medium">
                  <strong>{projectsNeedingApproval.length} project{projectsNeedingApproval.length !== 1 ? 's' : ''}</strong> {projectsNeedingApproval.length === 1 ? 'has' : 'have'} been marked complete by creators and need your approval.
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {projects.map((project) => {
                  const isHighlighted = highlightedProjectId === project.id;
                  const needsApproval = project.creator_completion_status === 'requested' && 
                                       project.business_completion_status !== 'requested';
                  const statusInfo = getCompletionStatus(project);

                  return (
                    <Card 
                      key={project.id} 
                      ref={isHighlighted ? highlightedRef : null}
                      className={cn(
                        "hover:shadow-md transition-all duration-300",
                        needsApproval && "border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
                        isHighlighted && "ring-2 ring-amber-500 ring-offset-2"
                      )}
                    >
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <CardTitle className="text-xl">{project.campaign.title}</CardTitle>
                              {needsApproval && (
                                <Badge variant="destructive" className="animate-pulse">
                                  <Zap className="h-3 w-3 mr-1" />
                                  Action Required
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                          {statusInfo.showBadge && (
                            <Badge variant={statusInfo.variant}>
                              {statusInfo.text}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground mb-4">{project.campaign.description}</p>

                        <div className="flex gap-2 flex-wrap">
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
                                  Processing Payment...
                                </>
                              ) : (
                                <>
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Approve & Release Payment
                                </>
                              )}
                            </Button>
                          ) : project.status === 'active' && (!project.business_completion_status || project.business_completion_status === 'pending') && (
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
                          {project.status === 'completed' && (
                            <Button
                              onClick={() => handleLeaveReview(project)}
                              variant="default"
                              size="sm"
                              className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                            >
                              <Star className="h-4 w-4 mr-2" />
                              Leave Review
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
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
                  );
                })}
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
          </>
        )}
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
          reviewType="business_to_creator"
        />
      )}
    </DashboardLayout>
  );
};

export default BusinessProjects;
