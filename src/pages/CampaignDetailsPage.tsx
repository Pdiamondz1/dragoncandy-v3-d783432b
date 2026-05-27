
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { useDeclineInvitation } from '@/hooks/useCampaignInvitations';
import { ApplicationsListFixed } from '@/components/campaigns/ApplicationsListFixed';
import { CreatorMatchingSection } from '@/components/campaigns/CreatorMatchingSection';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { ApplicationForm } from '@/components/campaigns/ApplicationForm';
import type { DonnyPitchResult } from '@/hooks/useDonnyApplyPitch';
import { deriveCampaignPhase, deriveCurrentStep } from '@/lib/campaignPhase';
import { CampaignStatusBanner } from '@/components/campaigns/detail/CampaignStatusBanner';
import { ProgressTimeline } from '@/components/campaigns/detail/ProgressTimeline';
import { AssignedCreatorCard } from '@/components/campaigns/detail/AssignedCreatorCard';
import { ContentReviewSection } from '@/components/campaigns/detail/ContentReviewSection';
import { DeliverablesArchive } from '@/components/campaigns/detail/DeliverablesArchive';
import { PaymentSummary } from '@/components/campaigns/detail/PaymentSummary';
import { CollapsibleCampaignDetails } from '@/components/campaigns/detail/CollapsibleCampaignDetails';
import { SponsorshipCard } from '@/components/campaigns/detail/SponsorshipCard';
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
import { useCampaignProject } from '@/hooks/useCampaignProject';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { useDeleteCampaign, useDuplicateCampaign } from '@/hooks/useCampaigns';
import { RatingModal } from '@/components/reviews/RatingModal';
import { useHasReviewedCollaboration } from '@/hooks/useHasReviewedCollaboration';
import { useCampaignApplicationsCount } from '@/hooks/useCampaignApplicationsCount';
import { useToast } from '@/hooks/use-toast';
import { SocialNudgeBanner } from '@/components/campaigns/SocialNudgeBanner';
import { useAgreedValue } from '@/hooks/useAgreedValue';
import { useEscrowCheckout } from '@/hooks/useEscrowCheckout';

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

  const declineInvitation = useDeclineInvitation();

  // One-tap apply flow state
  const [showApplySheet, setShowApplySheet] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showLegacyForm, setShowLegacyForm] = useState(false);

  // Business view state
  const [showRatingModal, setShowRatingModal] = useState(false);

  const businessName =
    enrichedDetail?.businessProfile?.business_name ??
    ((campaign?.ai_analysis as Record<string, unknown>)?.business_name as string | undefined);

  const backHref = isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns';

  // Business view hooks
  const { data: projectData, isLoading: projectLoading } = useCampaignProject(id ?? '');
  const { requestCompletion } = useProjectComplete();
  const deleteCampaign = useDeleteCampaign();
  const duplicateCampaign = useDuplicateCampaign();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Application count for the status banner
  const { data: applicationCounts } = useCampaignApplicationsCount(id ?? '');
  const applicationCount = applicationCounts?.total ?? 0;
  const { data: agreedValue } = useAgreedValue(id ?? '');

  // Must call before early returns to keep hook count stable
  const { data: existingReview } = useHasReviewedCollaboration(
    projectData?.collaboration?.id,
    user?.id,
  );

  const { initiateCheckout, isPayingEscrow } = useEscrowCheckout();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentParam = params.get('payment');
    if (!paymentParam || !id) return;

    const cleanUrl = () => navigate(location.pathname, { replace: true });

    if (paymentParam === 'success') {
      const sessionId = params.get('session_id') ?? undefined;

      const verifyOnce = async (): Promise<boolean> => {
        const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
          body: { campaignId: id, sessionId },
        });
        if (error) throw error;
        return !!data?.success;
      };

      const verify = async () => {
        try {
          let ok = await verifyOnce();
          if (!ok) {
            await new Promise(r => setTimeout(r, 3000));
            ok = await verifyOnce();
          }
          if (ok) {
            const pendingApproval = localStorage.getItem('autoApproveAfterPayment');
            if (pendingApproval) {
              const { collaborationId, campaignId: storedCampaignId } = JSON.parse(pendingApproval);
              localStorage.removeItem('autoApproveAfterPayment');
              if (storedCampaignId === id && collaborationId) {
                try {
                  const { error: payoutError } = await supabase.functions.invoke('release-creator-payout', {
                    body: { collaborationId },
                  });
                  if (payoutError) throw payoutError;
                  toast({ title: 'Content Approved!', description: 'Payment confirmed and released to creator.' });
                } catch {
                  toast({ title: 'Payment Confirmed!', description: 'Content approval failed — click Approve & Pay to retry.' });
                }
              } else {
                toast({ title: 'Payment Confirmed!', description: 'Your campaign is now published and visible to creators.' });
              }
            } else {
              toast({ title: 'Payment Confirmed!', description: 'Your campaign is now published and visible to creators.' });
            }
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['campaign', id] });
            queryClient.invalidateQueries({ queryKey: ['campaign-project', id] });
          } else {
            toast({ variant: 'destructive', title: 'Payment Pending', description: 'Payment not yet confirmed. Please refresh.' });
          }
        } catch {
          toast({ variant: 'destructive', title: 'Verification Failed', description: 'Could not verify payment. Please refresh.' });
        }
        cleanUrl();
      };
      void verify();
    } else if (paymentParam === 'cancelled') {
      localStorage.removeItem('autoApproveAfterPayment');
      toast({ title: 'Payment Cancelled', description: 'Your campaign was saved as a draft. You can pay escrow later.' });
      cleanUrl();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePayEscrow = () => {
    if (campaign) initiateCheckout(campaign.id);
  };

  const handleDelete = () => {
    if (!campaign) return;
    deleteCampaign.mutate(campaign.id, {
      onSuccess: () => navigate('/dashboard/business/campaigns'),
    });
  };

  const handleRelaunch = () => {
    if (!campaign) return;
    duplicateCampaign.mutate(campaign.id, {
      onSuccess: (newCampaign) => {
        if (newCampaign?.id) navigate(`/dashboard/business/campaigns/${newCampaign.id}/edit`);
      },
    });
  };

  const computeProposedTimeline = (deliveryType?: string | null): string => {
    const tierDays: Record<string, number> = { dragonrush: 0, expedited: 2, standard: 7 };
    const daysOut = deliveryType ? tierDays[deliveryType] ?? 7 : 7;
    const d = new Date();
    d.setDate(d.getDate() + daysOut);
    return d.toISOString().slice(0, 10);
  };

  const logDonnyEvent = (eventType: string, payload: Record<string, unknown>) => {
    supabase
      .from('donny_events')
      .insert({ event_type: eventType, user_id: user!.id, campaign_id: campaign?.id, payload })
      .then(({ error: logErr }) => { if (logErr) console.error('donny_events log failed:', logErr); });
  };

  const handleDonnySend = async (pitch: DonnyPitchResult, portfolioUrl?: string) => {
    if (!campaign) return;
    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch.pitch,
        proposedRate: pitch.suggested_rate,
        proposedTimeline: computeProposedTimeline(campaign.delivery_type),
        portfolioUrl: portfolioUrl ?? pitch.suggested_portfolio_piece_url ?? undefined,
        isInvited,
      });

      logDonnyEvent('apply_with_donny', { used_edit: false, pitch_source: pitch.pitch_source });
      setShowApplySheet(false);
      setShowConfirmation(true);
    } catch {
      // Error handled by useCreateApplication's onError toast
    }
  };

  const handleCounterOffer = async (pitch: DonnyPitchResult, counterRate: number, message: string, portfolioUrl?: string) => {
    if (!campaign) return;
    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: message || pitch.pitch,
        proposedRate: counterRate,
        proposedTimeline: computeProposedTimeline(campaign.delivery_type),
        portfolioUrl: portfolioUrl ?? pitch.suggested_portfolio_piece_url ?? undefined,
        isCounterOffer: true,
        isInvited: true,
      });

      logDonnyEvent('counter_offer_from_invite', { counter_rate: counterRate, original_price: campaign.fixed_price });
      setShowApplySheet(false);
      setShowConfirmation(true);
    } catch {
      // Error handled by useCreateApplication's onError toast
    }
  };

  const handleEditDetails = (_pitch: DonnyPitchResult) => {
    logDonnyEvent('apply_edit_details', {});
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
          <PageHeader>
            <div className="flex items-center">
              <button onClick={() => navigate(-1)} className="text-dc-pink-accent mr-2" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Campaign Details</h1>
              <div className="w-7" />
            </div>
          </PageHeader>
          <div className="md:max-w-2xl lg:max-w-3xl md:mx-auto md:mt-6 md:px-4">
            <CreatorCampaignDetails
              campaign={campaign}
              enrichedDetail={enrichedDetail}
              isInvited={isInvited}
              hasApplied={hasApplied}
              onQuickApply={() => setShowApplySheet(true)}
              onDeclineInvitation={
                pendingInvitation?.id
                  ? () => declineInvitation.mutate(pendingInvitation.id)
                  : undefined
              }
            />
          </div>

          <PrerequisiteGate feature="apply for this campaign" inline>
            <StickyApplyCTA
              canApply={canApply || canReapply}
              hasApplied={hasApplied}
              applicationStatus={applicationStatus}
              onApply={() => setShowApplySheet(true)}
              onViewProject={() => navigate('/dashboard/creator/projects')}
              positionFilled={campaign.status === 'active'}
            />

            <OneTapApplySheet
              open={showApplySheet}
              onOpenChange={setShowApplySheet}
              campaign={campaign}
              onSend={handleDonnySend}
              onEditDetails={handleEditDetails}
              isInvited={isInvited}
              onCounterOffer={handleCounterOffer}
            />
          </PrerequisiteGate>

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

  // Business/brand owner view — phase-dependent scroll layout
  const collaborationData = projectData?.collaboration ?? null;
  const creatorData = projectData?.creator ?? null;
  const phase = deriveCampaignPhase(campaign.status, collaborationData);
  const currentStep = collaborationData ? deriveCurrentStep(collaborationData) : null;

  const hasReviewed = !!existingReview;

  // Show project loading spinner only when in active/completed phase where we need collaboration data
  if (projectLoading && (campaign.status === 'active' || campaign.status === 'completed')) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="w-full max-w-full lg:max-w-6xl md:mx-auto p-4 space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="lg:grid lg:grid-cols-5 lg:gap-6 space-y-4 lg:space-y-0">
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
            <div className="lg:col-span-2">
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="w-full max-w-full lg:max-w-6xl md:mx-auto p-4 space-y-4 pb-24 md:pb-6">
        <PageHeader>
          <div className="flex items-center">
            <button onClick={() => navigate(backHref)} className="text-dc-pink-accent mr-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide truncate px-2">
              {campaign.title}
            </h1>
            <div className="w-5" />
          </div>
        </PageHeader>

        <CampaignStatusBanner
          campaign={campaign}
          phase={phase}
          currentStep={currentStep}
          applicationCount={applicationCount}
          creatorName={creatorData?.creator_name}
          hasReviewed={hasReviewed}
          isLoading={false}
          onEdit={() => navigate(`/dashboard/business/campaigns/${id}/edit`)}
          onDelete={handleDelete}
          onRelaunch={handleRelaunch}
          onPayEscrow={handlePayEscrow}
          onReviewApplications={() => {
            const el = document.getElementById('applications-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          onReviewContent={() => {
            const el = document.getElementById('content-review-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          onRequestRevision={() => {
            const el = document.getElementById('content-review-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          onViewDeliverables={() => {
            const el = document.getElementById('deliverables-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          onLeaveReview={() => setShowRatingModal(true)}
          isPayingEscrow={isPayingEscrow}
          agreedValue={agreedValue}
          hasAcceptedCreator={(applicationCounts?.accepted ?? 0) > 0}
        />

        {/* Desktop: 2-column layout for workflow + details; Mobile: stacked */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-6 space-y-4 lg:space-y-0">
          {/* Primary column: workflow sections */}
          <div className="lg:col-span-3 space-y-4">
            {phase !== 'cancelled' && currentStep && (
              <ProgressTimeline
                currentStep={currentStep}
                phase={phase}
                hasReviewed={hasReviewed}
                onLeaveReview={() => setShowRatingModal(true)}
                onMarkComplete={() => {
                  if (collaborationData) {
                    requestCompletion({
                      collaborationId: collaborationData.id,
                      userRole: 'business_client',
                    });
                  }
                }}
              />
            )}

            {BRAND_ROLE_ENABLED && campaign.open_for_sponsorship && (
              <SponsorshipCard campaignId={campaign.id} />
            )}

            {phase === 'pre_hire' && (
              <div id="applications-section" className="space-y-4">
                <ErrorBoundary level="section">
                  <ApplicationsListFixed campaignId={campaign.id} campaign={campaign} />
                </ErrorBoundary>
                {(applicationCounts?.accepted ?? 0) === 0 && (
                  <ErrorBoundary level="section">
                    <CreatorMatchingSection campaignId={campaign.id} />
                  </ErrorBoundary>
                )}
              </div>
            )}

            {(phase === 'active_delivery' || phase === 'completed') && creatorData && (
              <AssignedCreatorCard
                creatorName={creatorData.creator_name ?? 'Creator'}
                avatarUrl={creatorData.avatar_url ?? null}
                projectCount={creatorData.completed_projects ?? 0}
                campaignId={campaign.id}
                creatorId={collaborationData?.creator_id ?? ''}
              />
            )}

            {phase === 'active_delivery' && collaborationData && (
              <div id="content-review-section">
                <ContentReviewSection
                  collaborationId={collaborationData.id}
                  campaignId={campaign.id}
                  creatorId={collaborationData.creator_id ?? creatorData?.user_id ?? ''}
                  creatorName={creatorData?.creator_name ?? 'Creator'}
                  campaignTitle={campaign.title}
                  contentStatus={collaborationData.content_status ?? null}
                  revisionCount={collaborationData.revision_count ?? null}
                  escrowStatus={campaign.escrow_status ?? null}
                />
              </div>
            )}

            {phase === 'completed' && collaborationData && (
              <>
                <div id="deliverables-section">
                  <DeliverablesArchive
                    campaignId={campaign.id}
                    collaborationId={collaborationData.id}
                    campaignTitle={campaign.title}
                    campaignDescription={campaign.description}
                    creatorName={creatorData?.creator_name}
                    restaurantName={businessName}
                    userRole="business"
                  />
                </div>
                <PaymentSummary
                  completedAt={collaborationData.completed_at ?? null}
                  budgetMin={campaign.budget_min}
                  budgetMax={campaign.budget_max}
                />
                <SocialNudgeBanner
                  campaignId={campaign.id}
                  socialManagerPath="/dashboard/business/social"
                />
              </>
            )}
          </div>

          {/* Secondary column: campaign details */}
          <div className="lg:col-span-2 space-y-4">
            <CollapsibleCampaignDetails campaign={campaign} phase={phase} />
          </div>
        </div>
      </div>

      {showRatingModal && collaborationData && creatorData && !hasReviewed && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          collaborationId={collaborationData.id}
          revieweeId={creatorData.user_id}
          revieweeName={creatorData.creator_name ?? 'Creator'}
          reviewType="business_to_creator"
        />
      )}
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
