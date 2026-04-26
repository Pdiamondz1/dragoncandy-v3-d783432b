
import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle, Send, CheckCircle, FolderOpen } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplicationStatus } from '@/hooks/useCreatorApplicationStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ApplicationForm from '@/components/campaigns/ApplicationForm';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);

  const isCreatorView = location.pathname.includes('/creator/');
  const userRole = isCreatorView ? 'content_creator' : 'business_client';
  const isOwnCampaign = campaign?.user_id === user?.id;

  const searchParams = new URLSearchParams(location.search);
  const isInvitedByParam = searchParams.get('invited') === 'true';

  const { data: pendingInvitation } = useQuery({
    queryKey: ['pending-invitation', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaign_invitations')
        .select('id')
        .eq('campaign_id', id!)
        .eq('creator_id', user!.id)
        .eq('status', 'pending')
        .maybeSingle();
      return data;
    },
    enabled: !!id && !!user && isCreatorView,
  });

  const isInvited = isInvitedByParam || !!pendingInvitation;

  const { hasApplied, applicationStatus, isLoading: isCheckingStatus } = useCreatorApplicationStatus(id);

  const canApply = isCreatorView && !isOwnCampaign && campaign?.status === 'published' && !hasApplied;
  const showAppliedBadge = isCreatorView && hasApplied && applicationStatus === 'pending';
  const showAcceptedButton = isCreatorView && hasApplied && applicationStatus === 'accepted';
  const canReapply = isCreatorView && hasApplied && applicationStatus === 'rejected';

  const backHref = isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns';

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden">
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 text-center space-y-4 w-full max-w-sm">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Campaign not found</h2>
            <p className="text-gray-500 text-sm">
              This campaign doesn't exist or you don't have access to it.
            </p>
            <button
              onClick={() => navigate(backHref)}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Creator view — new sectioned layout
  if (isCreatorView) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-28">
          <div className="md:max-w-2xl md:mx-auto md:mt-6">
            <CreatorCampaignDetails campaign={campaign} isInvited={isInvited} />

            {/* Creator action buttons */}
            <div className="px-5 mt-4">
              {canApply && (
                <button
                  onClick={() => setShowApplicationDialog(true)}
                  className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Apply Now
                </button>
              )}
              {showAppliedBadge && (
                <div className="w-full rounded-full bg-gray-100 text-gray-500 font-bold py-3.5 flex items-center justify-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Applied (Pending)
                </div>
              )}
              {showAcceptedButton && (
                <button
                  onClick={() => navigate('/dashboard/creator/projects')}
                  className="w-full rounded-full bg-dc-teal text-white font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  View Project
                </button>
              )}
              {canReapply && (
                <button
                  onClick={() => setShowApplicationDialog(true)}
                  className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3.5 flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Apply Again
                </button>
              )}
              {campaign.creator_count && (
                <p className="text-center text-xs text-gray-500 mt-2">
                  {campaign.creator_count} spots total
                </p>
              )}
            </div>
          </div>

          <Dialog open={showApplicationDialog} onOpenChange={setShowApplicationDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Apply to Campaign</DialogTitle>
              </DialogHeader>
              <ApplicationForm
                campaign={campaign}
                onSuccess={() => setShowApplicationDialog(false)}
                onCancel={() => setShowApplicationDialog(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  // Business/brand owner view — existing tab layout
  return (
    <DashboardLayout userRole={userRole}>
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        <div className="relative h-40 bg-gradient-to-br from-dc-teal to-dc-teal-dark">
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center">
            <button onClick={() => navigate(backHref)} className="text-white mr-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-white uppercase tracking-wide truncate px-2">
              {campaign.title}
            </h1>
            {isOwnCampaign && (
              <button onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)} className="text-white" aria-label="Edit campaign">
                <Edit className="h-5 w-5" />
              </button>
            )}
            {!isOwnCampaign && <span className="w-5" />}
          </div>
        </div>

        <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 overflow-hidden md:max-w-5xl md:mx-auto md:rounded-3xl md:mt-6 md:shadow-lg">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 break-words">{campaign.title}</h2>
            <p className="text-gray-500 text-sm mt-0.5">Campaign Details & Management</p>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-gray-100">
              <TabsTrigger value="overview" className="rounded-full flex items-center gap-1.5 text-xs">
                <Target className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="applications" className="rounded-full flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" /> Applications
              </TabsTrigger>
              <TabsTrigger value="matching" className="rounded-full flex items-center gap-1.5 text-xs">
                <Target className="h-3.5 w-3.5" /> AI Match
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>
            <TabsContent value="applications">
              <ApplicationsListFixed campaignId={campaign.id} />
            </TabsContent>
            <TabsContent value="matching">
              <CreatorMatchingSection campaignId={campaign.id} />
            </TabsContent>
          </Tabs>

          {isOwnCampaign && (
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3 mt-6 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" /> Edit Campaign
            </button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
