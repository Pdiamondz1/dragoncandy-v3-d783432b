
import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { CampaignDetailsOverview } from '@/components/campaigns/CampaignDetailsOverview';
import { ApplicationsListFixed } from '@/components/campaigns/ApplicationsListFixed';
import { CreatorMatchingSection } from '@/components/campaigns/CreatorMatchingSection';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { StickyApplyCTA } from '@/components/campaign-details/StickyApplyCTA';
import { OneTapApplySheet } from '@/components/campaigns/OneTapApplySheet';
import { ApplyConfirmation } from '@/components/campaigns/ApplyConfirmation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplicationStatus } from '@/hooks/useCreatorApplicationStatus';
import { useCampaignDetailEnriched } from '@/hooks/useCampaignDetailEnriched';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApplicationForm } from '@/components/campaigns/ApplicationForm';
import type { DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);

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

  const { hasApplied, applicationStatus } = useCreatorApplicationStatus(id);
  const { data: enrichedDetail } = useCampaignDetailEnriched(
    id ?? null,
    campaign?.user_id ?? null
  );
  const createApplication = useCreateApplication();

  const canApply = isCreatorView && !isOwnCampaign && campaign?.status === 'published' && !hasApplied;
  const canReapply = isCreatorView && hasApplied && applicationStatus === 'rejected';

  // One-tap apply flow state
  const [showApplySheet, setShowApplySheet] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showLegacyForm, setShowLegacyForm] = useState(false);

  const businessName =
    enrichedDetail?.businessProfile?.business_name ??
    ((campaign?.ai_analysis as Record<string, unknown>)?.business_name as string | undefined);

  const backHref = isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns';

  const handleDonnySend = async (pitch: DonnyPitchResult) => {
    if (!campaign) return;
    try {
      const tierDates: Record<string, number> = { dragonrush: 0, expedited: 2, standard: 7 };
      const daysOut = campaign.delivery_type ? tierDates[campaign.delivery_type] ?? 7 : 7;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysOut);
      const pad = (n: number) => String(n).padStart(2, '0');
      const proposedTimeline = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;

      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch.pitch,
        proposedRate: pitch.suggested_rate,
        proposedTimeline,
        portfolioUrl: pitch.suggested_portfolio_piece_url ?? undefined,
      });

      // Log to donny_events
      supabase
        .from('donny_events')
        .insert({
          event_type: 'apply_with_donny',
          user_id: user!.id,
          campaign_id: campaign.id,
          payload: { used_edit: false, pitch_source: pitch.pitch_source },
        })
        .then(({ error: logErr }) => { if (logErr) console.error('donny_events log failed:', logErr); });

      setShowApplySheet(false);
      setShowConfirmation(true);
    } catch {
      // Error handled by useCreateApplication's onError toast
    }
  };

  const handleEditDetails = (_pitch: DonnyPitchResult) => {
    // Log that user chose to edit
    supabase
      .from('donny_events')
      .insert({
        event_type: 'apply_edit_details',
        user_id: user!.id,
        campaign_id: campaign?.id,
        payload: {},
      })
      .then(({ error: logErr }) => { if (logErr) console.error('donny_events log failed:', logErr); });

    setShowApplySheet(false);
    setShowLegacyForm(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-white overflow-x-hidden">
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
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 text-center space-y-4 w-full max-w-sm">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" aria-hidden="true" />
            <h2 className="text-lg font-bold text-gray-900">Campaign not found</h2>
            <p className="text-gray-500 text-sm">
              This campaign doesn't exist or you don't have access to it.
            </p>
            <button
              onClick={() => navigate(backHref)}
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Creator view — rebuilt with full brief + one-tap apply
  if (isCreatorView) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0">
          <div className="md:max-w-2xl md:mx-auto md:mt-6">
            <CreatorCampaignDetails
              campaign={campaign}
              enrichedDetail={enrichedDetail}
              isInvited={isInvited}
              hasApplied={hasApplied}
            />
          </div>

          <StickyApplyCTA
            canApply={canApply || canReapply}
            hasApplied={hasApplied}
            applicationStatus={applicationStatus}
            onApply={() => setShowApplySheet(true)}
            onViewProject={() => navigate('/dashboard/creator/projects')}
            spotsTotal={campaign.creator_count}
          />

          <OneTapApplySheet
            open={showApplySheet}
            onOpenChange={setShowApplySheet}
            campaign={campaign}
            onSend={handleDonnySend}
            onEditDetails={handleEditDetails}
          />

          <Dialog open={showLegacyForm} onOpenChange={setShowLegacyForm}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Apply to Campaign</DialogTitle>
              </DialogHeader>
              <ApplicationForm
                campaign={campaign}
                onSuccess={() => {
                  setShowLegacyForm(false);
                  setShowConfirmation(true);
                }}
                onCancel={() => setShowLegacyForm(false)}
              />
            </DialogContent>
          </Dialog>

          <ApplyConfirmation
            open={showConfirmation}
            onClose={() => setShowConfirmation(false)}
            businessName={businessName}
          />
        </div>
      </DashboardLayout>
    );
  }

  // Business/brand owner view — existing tab layout (unchanged)
  return (
    <DashboardLayout userRole={userRole}>
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="relative h-40 bg-gradient-to-br from-dc-teal to-dc-teal-dark">
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center">
            <button onClick={() => navigate(backHref)} className="text-white mr-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-white uppercase tracking-wide truncate px-2">
              {campaign.title}
            </h1>
            {isOwnCampaign && (
              <button onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)} className="text-white" aria-label="Edit campaign">
                <Edit className="h-5 w-5" aria-hidden="true" />
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
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> Overview
              </TabsTrigger>
              <TabsTrigger value="applications" className="rounded-full flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Applications
              </TabsTrigger>
              <TabsTrigger value="matching" className="rounded-full flex items-center gap-1.5 text-xs">
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> AI Match
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
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 mt-6 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" aria-hidden="true" /> Edit Campaign
            </button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
