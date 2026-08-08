import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreHorizontal,
  Pencil,
  AlertTriangle,
  Megaphone,
  Clock,
  Eye,
  Rocket,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EscrowFeeBreakdown } from '@/components/payments/EscrowFeeBreakdown';
import {
  type CampaignPhase,
  type ProjectStep,
  needsBusinessAction,
  PROJECT_STEPS,
  getStepIndex,
} from '@/lib/campaignPhase';

type BannerState =
  | 'draft'
  | 'payment_pending'
  | 'payment_pending_project'
  | 'published'
  | 'pending_review'
  | 'action_needed'
  | 'active'
  | 'completed'
  | 'cancelled';

interface CampaignStatusBannerProps {
  campaign: {
    id: string;
    title: string;
    status: string;
    escrow_status?: string | null;
    fixed_price?: number | null;
    budget_max?: number | null;
    delivery_fee?: number | null;
    delivery_type?: string | null;
    group_id?: string | null;
  };
  phase: CampaignPhase;
  currentStep: ProjectStep | null;
  applicationCount: number;
  oldestApplicantName?: string | null;
  oldestApplicantDaysAgo?: number;
  creatorName?: string | null;
  deliverableCount?: number;
  hasReviewed?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRelaunch: () => void;
  onPayEscrow: () => void;
  onReviewApplications: () => void;
  onReviewContent: () => void;
  onRequestRevision: () => void;
  onViewDeliverables: () => void;
  onLeaveReview: () => void;
  isPayingEscrow?: boolean;
  agreedValue?: number | null;
  hasAcceptedCreator?: boolean;
}

function deriveBannerState(
  phase: CampaignPhase,
  status: string,
  escrowStatus: string | null | undefined,
  applicationCount: number,
  step: ProjectStep | null,
  hasAcceptedCreator?: boolean,
  isGroupCampaign?: boolean,
): BannerState {
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'completed') return 'completed';
  if (phase === 'active_delivery') {
    return step && needsBusinessAction(step) ? 'action_needed' : 'active';
  }
  // pre_hire
  if (status === 'draft') return 'draft';
  // Free crew campaigns have no escrow — never show the pay-escrow state for them.
  if (hasAcceptedCreator && escrowStatus !== 'held' && escrowStatus !== 'released' && !isGroupCampaign) return 'payment_pending_project';
  if (escrowStatus === 'pending') return 'payment_pending';
  if (applicationCount > 0) return 'pending_review';
  return 'published';
}

const bannerStyles: Record<BannerState, string> = {
  draft: 'bg-teal-50 border-2 border-teal-300',
  payment_pending: 'bg-amber-50 border-2 border-amber-400',
  payment_pending_project: 'bg-amber-50 border-2 border-amber-400',
  published: 'bg-teal-50 border-2 border-teal-300',
  pending_review: 'bg-amber-50 border-2 border-amber-400',
  action_needed: 'bg-pink-50 border-2 border-pink-400',
  active: 'bg-teal-50 border-2 border-teal-300',
  completed: 'bg-green-50 border-2 border-green-300',
  cancelled: 'bg-red-50 border-2 border-red-300',
};

const bannerIcons: Record<BannerState, React.ReactNode> = {
  draft: <Pencil className="h-5 w-5 text-teal-600" />,
  payment_pending: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  payment_pending_project: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  published: <Megaphone className="h-5 w-5 text-teal-600" />,
  pending_review: <Clock className="h-5 w-5 text-amber-600" />,
  action_needed: <Eye className="h-5 w-5 text-pink-600" />,
  active: <Rocket className="h-5 w-5 text-teal-600" />,
  completed: <CheckCircle className="h-5 w-5 text-green-600" />,
  cancelled: <XCircle className="h-5 w-5 text-red-600" />,
};

export const CampaignStatusBanner: React.FC<CampaignStatusBannerProps> = ({
  campaign,
  phase,
  currentStep,
  applicationCount,
  oldestApplicantName,
  oldestApplicantDaysAgo,
  creatorName,
  deliverableCount,
  hasReviewed,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onDelete,
  onRelaunch,
  onPayEscrow,
  onReviewApplications,
  onReviewContent,
  onViewDeliverables,
  onLeaveReview,
  isPayingEscrow,
  agreedValue,
  hasAcceptedCreator,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl bg-teal-50" />;
  }

  if (isError) {
    return (
      <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-teal-800">Unable to load campaign status</span>
        <Button size="sm" variant="outline" className="rounded-full border-teal-300 text-teal-600" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    );
  }

  const state = deriveBannerState(phase, campaign.status, campaign.escrow_status, applicationCount, currentStep, hasAcceptedCreator, !!campaign.group_id);

  const canDelete = (phase === 'pre_hire' || phase === 'cancelled') && campaign.escrow_status !== 'held';
  const canEdit = phase === 'pre_hire';
  const isCrewCampaign = !!campaign.group_id;
  // A crew campaign can be re-opened to the marketplace while it is still live:
  // it is free and crew-only, so an unfilled one has no exit otherwise — the
  // business would have to cancel it first just to reach Re-Launch. Once a crew
  // member is accepted it IS filled, so the escape hatch closes.
  const canRelaunch =
    phase === 'completed' || phase === 'cancelled' || (isCrewCampaign && !hasAcceptedCreator);
  // Duplicating always drops group_id, so for a crew campaign this action is
  // literally "publish it to the marketplace instead" — name it that.
  const relaunchLabel = isCrewCampaign ? 'Open to the marketplace' : 'Re-Launch Campaign';
  const showMenu = canEdit || canDelete || canRelaunch;

  const renderHeadline = (): string => {
    switch (state) {
      case 'draft': return 'Draft — Not Published';
      case 'payment_pending': return 'Payment Required to Publish';
      case 'payment_pending_project': return 'Payment Required to Start Project';
      case 'published': return 'Campaign Published — Awaiting Applications';
      case 'pending_review':
        return applicationCount === 1
          ? '1 Application Awaiting Your Review'
          : `${applicationCount} Applications Awaiting Your Review`;
      case 'action_needed': return 'Content Ready for Your Review';
      case 'active':
        return phase === 'active_delivery' && creatorName
          ? `${creatorName} is working on your content`
          : 'Campaign In Progress';
      case 'completed': return 'Campaign Completed';
      case 'cancelled': return 'Campaign Cancelled';
    }
  };

  const renderSubtext = (): string => {
    switch (state) {
      case 'draft': return 'This campaign hasn\'t been published yet. Review and publish when ready.';
      case 'payment_pending': return 'Complete your Stripe checkout to make this campaign visible to creators.';
      case 'payment_pending_project': return 'Complete your Stripe checkout to fund escrow and activate this campaign.';
      case 'published': return 'Your campaign is live. Creators can now discover and apply.';
      case 'pending_review':
        if (applicationCount === 1 && oldestApplicantName) {
          return `${oldestApplicantName} applied ${oldestApplicantDaysAgo ?? 0} day${(oldestApplicantDaysAgo ?? 0) !== 1 ? 's' : ''} ago. Review their profile to accept or decline.`;
        }
        return `${applicationCount} creators have applied.${oldestApplicantName ? ` Oldest: ${oldestApplicantName}, ${oldestApplicantDaysAgo ?? 0} day${(oldestApplicantDaysAgo ?? 0) !== 1 ? 's' : ''} ago.` : ''}`;
      case 'action_needed':
        return `${creatorName ?? 'Creator'} submitted ${deliverableCount ?? 0} deliverable${(deliverableCount ?? 0) !== 1 ? 's' : ''}. Approve to release payment, or request revisions.`;
      case 'active': {
        if (phase === 'active_delivery') {
          return 'You\'ll be notified when content is ready for review.';
        }
        if (currentStep) {
          const idx = getStepIndex(currentStep);
          const stepInfo = PROJECT_STEPS[idx];
          return `Step ${idx + 1} of ${PROJECT_STEPS.length} — ${stepInfo.label}`;
        }
        return 'Campaign is in active delivery.';
      }
      case 'completed': return 'All deliverables received and payment released.';
      case 'cancelled': return 'This campaign is no longer active.';
    }
  };

  const renderCtas = () => {
    switch (state) {
      case 'draft':
        return (
          <Button onClick={onEdit} className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full lg:w-auto">
            Edit Draft
          </Button>
        );
      case 'payment_pending':
        return (
          <div className="space-y-2 w-full lg:w-auto">
            <EscrowFeeBreakdown
              creatorRate={agreedValue ?? campaign.fixed_price ?? campaign.budget_max ?? 0}
              deliveryFee={campaign.delivery_fee || 0}
              deliveryType={campaign.delivery_type || 'standard'}
            />
            <Button onClick={onPayEscrow} disabled={isPayingEscrow} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold w-full">
              {isPayingEscrow ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : 'Pay & Publish'}
            </Button>
          </div>
        );
      case 'payment_pending_project':
        return (
          <div className="space-y-2 w-full lg:w-auto">
            <EscrowFeeBreakdown
              creatorRate={agreedValue ?? campaign.fixed_price ?? campaign.budget_max ?? 0}
              deliveryFee={campaign.delivery_fee || 0}
              deliveryType={campaign.delivery_type || 'standard'}
            />
            <Button onClick={onPayEscrow} disabled={isPayingEscrow} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold w-full">
              {isPayingEscrow ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : 'Pay Escrow'}
            </Button>
          </div>
        );
      case 'published':
        return null;
      case 'pending_review':
        return (
          <Button onClick={onReviewApplications} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold w-full lg:w-auto">
            Review Applications →
          </Button>
        );
      case 'action_needed':
        return (
          <Button
            onClick={onReviewContent}
            variant="link"
            className="h-auto p-0 font-semibold text-pink-600 hover:text-pink-700"
          >
            Review content
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        );
      case 'active':
        return null;
      case 'completed':
        return hasReviewed ? (
          <Button onClick={onViewDeliverables} className="rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold w-full lg:w-auto">
            View Deliverables
          </Button>
        ) : (
          <Button onClick={onLeaveReview} className="rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold w-full lg:w-auto">
            Leave a Review
          </Button>
        );
      case 'cancelled':
        return (
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <Button onClick={onRelaunch} className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full sm:flex-1 lg:flex-none">
              {relaunchLabel}
            </Button>
            {canDelete && (
              <Button onClick={() => setShowDeleteConfirm(true)} variant="outline" className="rounded-full border-red-300 text-red-600 hover:bg-red-50 font-semibold w-full sm:flex-1 lg:flex-none">
                Delete
              </Button>
            )}
          </div>
        );
    }
  };

  const renderProgressBar = () => {
    if (state !== 'active' || !currentStep) return null;
    const idx = getStepIndex(currentStep);
    const progress = ((idx + 1) / PROJECT_STEPS.length) * 100;
    return (
      <div className="h-1.5 bg-teal-100 rounded-full mt-2 overflow-hidden">
        <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
    );
  };

  return (
    <>
      <div className={`${bannerStyles[state]} rounded-2xl p-4`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{bannerIcons[state]}</div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-gray-900">{renderHeadline()}</p>
                <p className="text-xs text-gray-600 mt-0.5">{renderSubtext()}</p>
              </div>
              {showMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEdit && <DropdownMenuItem onClick={onEdit}>Edit Campaign</DropdownMenuItem>}
                    {canDelete && (
                      <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600">
                        Delete Campaign
                      </DropdownMenuItem>
                    )}
                    {canRelaunch && <DropdownMenuItem onClick={onRelaunch}>{relaunchLabel}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {renderProgressBar()}
            <div className="pt-1">{renderCtas()}</div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{campaign.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="rounded-full bg-red-500 hover:bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
