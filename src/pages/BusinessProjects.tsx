
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Download, MessageCircle, User, Calendar, FileText, FileCheck,
  Loader2, CheckCircle2, AlertCircle, Zap, Star, DollarSign, ChevronLeft
} from 'lucide-react';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFileUploads } from '@/hooks/useFileQuery';
import { formatFileSize } from '@/lib/fileUtils';
import { cn } from '@/lib/utils';
import { RatingModal } from '@/components/reviews/RatingModal';
import { QuickApprovalCard } from '@/components/projects/QuickApprovalCard';
import { useToast } from '@/hooks/use-toast';

interface ProjectCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: string;
  content_status?: string | null;
  revision_count?: number | null;
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
          title: 'Verifying payment…',
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
          content_status,
          revision_count,
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

      return data.map(item => ({
        id: item.id,
        campaign_id: item.campaign_id,
        creator_id: item.creator_id,
        status: item.status,
        content_status: item.content_status,
        revision_count: item.revision_count,
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

  const handleDownloadFile = async (file: { id: string; bucket_name: string; file_path: string; original_filename: string }) => {
    setDownloadingFileId(file.id);
    try {
      const { data } = await supabase.storage
        .from(file.bucket_name)
        .download(file.file_path);

      if (data) {
        const url = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.original_filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

  const projectsNeedingApproval = projects?.filter(
    p => p.creator_completion_status === 'requested' && p.business_completion_status !== 'requested'
  ) || [];

  const projectsNeedingContentReview = projects?.filter(
    p => p.content_status === 'submitted'
  ) || [];

  if (projectsLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-5 bg-gray-200 rounded-full animate-pulse mr-2" />
            <span className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-8" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="border-2 border-gray-100 rounded-2xl p-4 h-24 animate-pulse bg-gray-50" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (projectsError) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Unable to load projects</h3>
            <p className="text-gray-500 text-sm">Please refresh the page or try again later.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden md:max-w-4xl md:mx-auto">
        {/* Template B Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="text-dc-pink-accent text-lg mr-2 flex items-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 font-sans text-base font-bold text-gray-900 uppercase tracking-wide text-center">
            My Projects
          </h1>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {projects?.length || 0} project{projects?.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Body */}
        <div className="px-4 pt-4 pb-24 md:pb-0 space-y-4">

          {!projects || projects.length === 0 ? (
            <div className="border-2 border-dc-teal rounded-2xl p-10 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" />
              <h3 className="font-bold text-gray-900 mb-1">No Projects Yet</h3>
              <p className="text-sm text-gray-500 mb-4">
                Once creators are assigned to your campaigns, they'll appear here.
              </p>
              <Button
                onClick={() => navigate('/dashboard/business/campaigns')}
                className="rounded-full bg-dc-teal text-white font-bold px-6"
              >
                View My Campaigns
              </Button>
            </div>
          ) : (
            <>
              {/* Action Required Banners */}
              {projectsNeedingContentReview.length > 0 && (
                <Alert className="border-green-500 bg-green-50 rounded-2xl">
                  <FileCheck className="h-5 w-5 text-green-600" />
                  <AlertDescription className="text-green-800 font-medium">
                    <strong>{projectsNeedingContentReview.length} deliverable{projectsNeedingContentReview.length !== 1 ? 's' : ''}</strong> submitted and ready for your one-tap approval.
                  </AlertDescription>
                </Alert>
              )}
              {projectsNeedingApproval.length > 0 && (
                <Alert className="border-amber-500 bg-amber-50 rounded-2xl">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <AlertDescription className="text-amber-800 font-medium">
                    <strong>{projectsNeedingApproval.length} project{projectsNeedingApproval.length !== 1 ? 's' : ''}</strong> {projectsNeedingApproval.length === 1 ? 'has' : 'have'} been marked complete by creators and need your approval.
                  </AlertDescription>
                </Alert>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="rounded-full bg-gray-100">
                  <TabsTrigger value="overview" className="rounded-full text-xs font-bold uppercase tracking-wide">
                    Overview
                  </TabsTrigger>
                  {projectsNeedingContentReview.length > 0 && (
                    <TabsTrigger value="needs-review" className="relative rounded-full text-xs font-bold uppercase tracking-wide">
                      Review
                      <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-xs rounded-full">
                        {projectsNeedingContentReview.length}
                      </Badge>
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="deliverables" className="rounded-full text-xs font-bold uppercase tracking-wide">
                    Files
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3">
                  {projects.map((project) => {
                    const isHighlighted = highlightedProjectId === project.id;
                    const needsApproval = project.creator_completion_status === 'requested' &&
                                         project.business_completion_status !== 'requested';
                    const statusInfo = getCompletionStatus(project);

                    return (
                      <div
                        key={project.id}
                        ref={isHighlighted ? highlightedRef : null}
                        className={cn(
                          "border-2 border-dc-teal rounded-2xl p-4 bg-white space-y-3",
                          needsApproval && "border-amber-400 bg-amber-50/50",
                          isHighlighted && "ring-2 ring-amber-500 ring-offset-2"
                        )}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-gray-900 truncate">{project.campaign.title}</h3>
                              {needsApproval && (
                                <Badge variant="destructive" className="animate-pulse text-xs rounded-full">
                                  <Zap className="h-3 w-3 mr-1" />
                                  Action Required
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {project.creator_profile?.creator_name ||
                                 project.user_profile?.full_name ||
                                 project.user_profile?.email || 'Creator'}
                              </span>
                              {project.campaign.deadline && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Due: {new Date(project.campaign.deadline).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {statusInfo.showBadge && (
                            <Badge variant={statusInfo.variant} className="rounded-full text-xs shrink-0">
                              {statusInfo.text}
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-500 line-clamp-2">{project.campaign.description}</p>

                        {/* One-Tap Content Approval */}
                        <QuickApprovalCard
                          collaborationId={project.id}
                          campaignId={project.campaign_id}
                          creatorId={project.creator_id}
                          creatorName={
                            project.creator_profile?.creator_name ||
                            project.user_profile?.full_name ||
                            project.user_profile?.email ||
                            'Creator'
                          }
                          contentStatus={project.content_status || null}
                          revisionCount={project.revision_count || 0}
                        />

                        <div className="flex gap-2 flex-wrap pt-1">
                          {needsApproval ? (
                            <Button
                              onClick={() => handleMarkComplete(project.id)}
                              disabled={requestingId === project.id}
                              size="sm"
                              className="rounded-full bg-amber-600 hover:bg-amber-700 text-white font-bold"
                            >
                              {requestingId === project.id ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                              ) : (
                                <><DollarSign className="h-4 w-4 mr-2" />Approve & Release Payment</>
                              )}
                            </Button>
                          ) : project.status === 'active' && (!project.business_completion_status || project.business_completion_status === 'pending') && (
                            <Button
                              onClick={() => handleMarkComplete(project.id)}
                              disabled={requestingId === project.id}
                              size="sm"
                              className="rounded-full bg-dc-teal text-white font-bold"
                            >
                              {requestingId === project.id ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Completing...</>
                              ) : (
                                <><CheckCircle2 className="h-4 w-4 mr-2" />Mark Complete</>
                              )}
                            </Button>
                          )}
                          {project.status === 'completed' && (
                            <Button
                              onClick={() => handleLeaveReview(project)}
                              size="sm"
                              className="rounded-full bg-dc-pink-accent text-white font-bold"
                            >
                              <Star className="h-4 w-4 mr-2" />
                              Leave Review
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-dc-teal text-dc-teal font-bold"
                            onClick={() => {
                              setSelectedProject(project.campaign_id);
                              setActiveTab('deliverables');
                            }}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Files
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-dc-teal text-dc-teal font-bold"
                            onClick={() => handleMessageCreator(project.campaign_id)}
                          >
                            <MessageCircle className="h-4 w-4 mr-1" />
                            Message
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* Needs Review Tab */}
                <TabsContent value="needs-review" className="space-y-3">
                  {projectsNeedingContentReview.length === 0 ? (
                    <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-400" />
                      <h3 className="font-bold text-gray-900 mb-1">All Caught Up!</h3>
                      <p className="text-sm text-gray-500">No content waiting for your review.</p>
                    </div>
                  ) : (
                    projectsNeedingContentReview.map((project) => (
                      <div key={project.id} className="border-2 border-green-400 rounded-2xl p-4 bg-white space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-bold text-gray-900">{project.campaign.title}</h3>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <User className="h-3 w-3" />
                              {project.creator_profile?.creator_name || project.user_profile?.full_name || 'Creator'}
                            </p>
                          </div>
                          <Badge className="bg-green-100 text-green-700 rounded-full text-xs shrink-0">
                            <FileCheck className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        </div>
                        <QuickApprovalCard
                          collaborationId={project.id}
                          campaignId={project.campaign_id}
                          creatorId={project.creator_id}
                          creatorName={
                            project.creator_profile?.creator_name ||
                            project.user_profile?.full_name ||
                            project.user_profile?.email ||
                            'Creator'
                          }
                          contentStatus={project.content_status || null}
                          revisionCount={project.revision_count || 0}
                        />
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-dc-teal text-dc-teal font-bold"
                            onClick={() => {
                              setSelectedProject(project.campaign_id);
                              setActiveTab('deliverables');
                            }}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Files
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-dc-teal text-dc-teal font-bold"
                            onClick={() => handleMessageCreator(project.campaign_id)}
                          >
                            <MessageCircle className="h-4 w-4 mr-1" />
                            Message
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="deliverables" className="space-y-3">
                  {selectedProject ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Project Deliverables</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-dc-teal text-dc-teal font-bold"
                          onClick={() => setSelectedProject(null)}
                        >
                          Show All
                        </Button>
                      </div>

                      {projectFiles && projectFiles.length > 0 ? (
                        <div className="space-y-3">
                          {projectFiles.map((file) => (
                            <div key={file.id} className="border-2 border-dc-teal rounded-2xl p-4 flex items-center justify-between gap-3">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <p className="font-bold text-gray-900 truncate text-sm">{file.original_filename}</p>
                                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                  <span>{formatFileSize(file.file_size)}</span>
                                  <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                                  {file.uploader_profile?.full_name && (
                                    <span>by {file.uploader_profile.full_name}</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="rounded-full bg-dc-teal text-white font-bold shrink-0"
                                onClick={() => handleDownloadFile(file)}
                                disabled={downloadingFileId === file.id}
                              >
                                {downloadingFileId === file.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-gray-500">No deliverables uploaded yet.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-500">Select a project to view its deliverables.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
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
