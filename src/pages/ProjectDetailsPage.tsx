import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  FileCheck,
  MessageSquare,
  Calendar,
  DollarSign,
  User,
  Clock,
  Zap
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCollaboration } from '@/hooks/useCollaboration';
import { usePaymentTimeline } from '@/hooks/usePaymentTimeline';
import { usePaymentNotifications } from '@/hooks/usePaymentNotifications';
import ContentApprovalPanel from '@/components/projects/ContentApprovalPanel';
import CreatorContentSubmit from '@/components/projects/CreatorContentSubmit';
import CreatorPayoutBanner from '@/components/projects/CreatorPayoutBanner';
import DragonDashTimer from '@/components/projects/DragonDashTimer';
import StartContentButton from '@/components/projects/StartContentButton';
import ProjectFileUpload from '@/components/projects/ProjectFileUpload';
import { useFileUploads } from '@/hooks/useFileUploads';
import ProtectedFilePreview from '@/components/projects/ProtectedFilePreview';
import { useDragonDashTimer } from '@/hooks/useDragonDashTimer';
import { formatDistanceToNow, format } from 'date-fns';

const ProjectDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: collaboration, isLoading, error } = useCollaboration(id!);
  const { data: files } = useFileUploads(collaboration?.campaign_id, 'deliverable');
  const { timerData, startContentCreation } = useDragonDashTimer(id || null);
  const { data: timelineEvents } = usePaymentTimeline('collaboration', id);
  const isBusinessClient = profile?.role === 'business_client';
  const isCreator = profile?.role === 'content_creator';
  usePaymentNotifications(timelineEvents, isCreator ? 'creator' : 'business');
  const isDragonDash = collaboration?.campaign?.delivery_type && collaboration.campaign.delivery_type !== 'standard';

  const getDeliveryLabel = (type: string | null) => {
    switch (type) {
      case 'expedited': return 'Expedited (8-12hr)';
      case 'dragon_rush': return 'DragonRush (1-3hr)';
      default: return 'Standard (72hr)';
    }
  };

  const getTotalAmount = () => {
    if (!collaboration?.campaign) return 0;
    const { fixed_price, budget_min, budget_max, delivery_fee } = collaboration.campaign;
    const baseAmount = fixed_price || ((budget_min || 0) + (budget_max || 0)) / 2;
    return baseAmount + (delivery_fee || 0);
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
        <div className="min-h-screen bg-white overflow-x-hidden">
          {/* Hero skeleton */}
          <div className="h-48 bg-gray-400 animate-pulse" />
          {/* White card overlay */}
          <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-24 md:pb-0 space-y-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !collaboration) {
    return (
      <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
            <FileCheck className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="font-bold text-gray-900 mb-2">Project Not Found</h3>
            <p className="text-sm text-gray-500 mb-4">
              This project doesn't exist or you don't have access to it.
            </p>
            <Button
              onClick={() => navigate(-1)}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Go Back
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={isBusinessClient ? 'business_client' : 'content_creator'}>
      <div className="min-h-screen bg-white overflow-x-hidden md:max-w-4xl md:mx-auto">
        {/* Template D — Hero image area */}
        <div className="relative h-44 bg-gradient-to-br from-dc-teal to-dc-teal-dark overflow-hidden">
          {/* Header overlay on hero */}
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center z-10">
            <button
              onClick={() => navigate(isBusinessClient ? '/dashboard/business/projects' : '/dashboard/creator/projects')}
              className="text-white flex items-center mr-3"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="flex-1 font-sans text-sm font-bold text-white uppercase tracking-wide text-center">
              Project Details
            </span>
            <div className="flex items-center gap-2">
              {isDragonDash && (
                <Badge variant="destructive" className="gap-1 text-xs rounded-full">
                  <Zap className="h-3 w-3" />
                  {getDeliveryLabel(collaboration.campaign.delivery_type)}
                </Badge>
              )}
              <Badge
                variant={collaboration.status === 'completed' ? 'secondary' : 'default'}
                className="rounded-full text-xs"
              >
                {collaboration.status}
              </Badge>
            </div>
          </div>

          {/* Hero title area */}
          <div className="absolute bottom-8 left-0 right-0 px-4">
            <h1 className="text-xl font-extrabold text-white leading-tight line-clamp-2">
              {collaboration.campaign.title}
            </h1>
            <p className="text-white/80 text-sm mt-1">
              {isBusinessClient
                ? `Working with ${collaboration.creator_profile?.creator_name || 'Creator'}`
                : `Project for ${collaboration.business_profile?.business_name || 'Client'}`
              }
            </p>
          </div>
        </div>

        {/* White card overlay — Template D body */}
        <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-24 md:pb-0 space-y-4">

          {/* Stats row with pink dividers */}
          <div className="flex divide-x divide-dc-pink py-2">
            <div className="flex-1 text-center px-2">
              <p className="text-2xl font-extrabold text-gray-900">
                ${getTotalAmount().toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Project Value</p>
            </div>
            <div className="flex-1 text-center px-2">
              <p className="text-2xl font-extrabold text-gray-900">
                {collaboration.campaign.deadline
                  ? format(new Date(collaboration.campaign.deadline), 'MMM d')
                  : '—'}
              </p>
              <p className="text-xs text-gray-500">Deadline</p>
            </div>
            <div className="flex-1 text-center px-2">
              <p className="text-2xl font-extrabold text-gray-900 capitalize">
                {collaboration.status}
              </p>
              <p className="text-xs text-gray-500">Status</p>
            </div>
          </div>

          {/* Payment Timeline */}
          {collaboration?.id && collaboration?.campaign_id && (
            <PaymentTimeline
              entityType="collaboration"
              entityId={collaboration.id}
              campaignId={collaboration.campaign_id}
              userRole={isCreator ? 'creator' : 'business'}
              variant="compact"
            />
          )}

          {/* Creator Payout Banner (for creators only) */}
          {isCreator && <CreatorPayoutBanner creatorId={user!.id} />}

          {/* DragonDash Timer */}
          {timerData && timerData.status !== 'not_started' && collaboration.content_status !== 'approved' && (
            <DragonDashTimer
              formattedTime={timerData.formattedTime}
              percentageRemaining={timerData.percentageRemaining}
              status={timerData.status}
              deliveryType={timerData.deliveryType}
            />
          )}

          {/* Project Details Card */}
          <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-3">
            <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm">Project Details</h2>

            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-dc-teal shrink-0" />
              <div>
                <p className="text-xs text-gray-500">{isBusinessClient ? 'Creator' : 'Client'}</p>
                <p className="font-bold text-gray-900 text-sm">
                  {isBusinessClient
                    ? collaboration.creator_profile?.creator_name
                    : collaboration.business_profile?.business_name
                  }
                </p>
              </div>
            </div>

            {collaboration.campaign.deadline && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-dc-teal shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Deadline</p>
                  <p className="font-bold text-gray-900 text-sm">
                    {format(new Date(collaboration.campaign.deadline), 'PPP')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-dc-teal shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Project Value</p>
                <p className="font-bold text-gray-900 text-sm">
                  ${getTotalAmount().toLocaleString()}
                  {collaboration.campaign.delivery_fee ? (
                    <span className="text-xs text-gray-500 ml-1">
                      (includes ${collaboration.campaign.delivery_fee} delivery fee)
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-dc-teal shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Started</p>
                <p className="font-bold text-gray-900 text-sm">
                  {formatDistanceToNow(new Date(collaboration.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>

          {/* Content Approval / Submission Panel */}
          {isBusinessClient ? (
            <ContentApprovalPanel
              collaborationId={collaboration.id}
              campaignId={collaboration.campaign_id}
              contentStatus={collaboration.content_status}
              revisionCount={collaboration.revision_count}
              creatorId={collaboration.creator_id}
              creatorName={collaboration.creator_profile?.creator_name || 'Creator'}
              submittedAt={collaboration.submitted_at}
              reviewExtended={collaboration.review_extended}
              deliveryType={collaboration.campaign.delivery_type || 'standard'}
              disputeReason={collaboration.dispute_reason}
              disputeOutcome={collaboration.dispute_outcome}
            />
          ) : (
            <div className="space-y-3">
              {(!collaboration.content_status || collaboration.content_status === 'pending') && (
                <div className="border-2 border-dc-teal rounded-2xl p-4">
                  <StartContentButton
                    deliveryType={collaboration.campaign.delivery_type || 'standard'}
                    onStart={startContentCreation}
                  />
                </div>
              )}

              <CreatorContentSubmit
                collaborationId={collaboration.id}
                campaignId={collaboration.campaign_id}
                contentStatus={collaboration.content_status}
                revisionCount={collaboration.revision_count}
                businessName={collaboration.business_profile?.business_name || 'Client'}
                disputeReason={collaboration.dispute_reason}
                disputeOutcome={collaboration.dispute_outcome}
              />
            </div>
          )}

          {/* Deliverables Section */}
          <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-3">
            <div>
              <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm">Deliverables</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isCreator
                  ? 'Upload your content files here'
                  : 'View and download submitted content'
                }
              </p>
            </div>

            {isCreator && collaboration.content_status !== 'approved' && (
              <div>
                <ProjectFileUpload
                  campaignId={collaboration.campaign_id}
                  campaignTitle={collaboration.campaign.title}
                />
              </div>
            )}

            {files && files.length > 0 ? (
              <div className="space-y-2">
                {files.map((file) => (
                  <ProtectedFilePreview
                    key={file.id}
                    file={file}
                    contentStatus={collaboration.content_status}
                    isBusinessClient={isBusinessClient}
                    collaborationId={collaboration.id}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No files uploaded yet
              </p>
            )}
          </div>

          {/* Primary CTA — full-width teal pill */}
          <Button
            className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            onClick={() => navigate(`/messages/${collaboration.campaign_id}`)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Open Messages
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetailsPage;
