import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, MessageCircle, User, Loader2, ArrowRight,
} from 'lucide-react';
import { useCampaignProject, deriveCurrentStep } from '@/hooks/useCampaignProject';
import { useProjectComplete } from '@/hooks/useProjectComplete';
import { RatingModal } from '@/components/reviews/RatingModal';
import { useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

const STEPS = [
  { key: 'hired', label: 'Creator hired & escrow held' },
  { key: 'submitted', label: 'Content submitted by creator' },
  { key: 'review', label: 'Review & approve content' },
  { key: 'payment', label: 'Release payment' },
  { key: 'review_left', label: 'Leave review' },
] as const;

function stepIndex(step: string): number {
  return STEPS.findIndex((s) => s.key === step);
}

export default function CampaignProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useCampaignProject(id ?? '');
  const { requestCompletion, requestingId } = useProjectComplete();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !project) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full border-2 border-teal-300">
            <h3 className="font-bold text-gray-900 mb-2">Project not found</h3>
            <p className="text-gray-500 text-sm mb-4">This campaign may not have an active collaboration yet.</p>
            <Button
              onClick={() => navigate('/dashboard/business/campaigns')}
              className="rounded-full bg-teal-400 text-white font-bold w-full"
            >
              Back to Campaigns
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentStep = deriveCurrentStep(project);
  const currentIdx = stepIndex(currentStep);
  const { campaign, creator, collaboration } = project;

  const avatarUrl = creator.avatar_url
    ? creator.avatar_url.startsWith('http')
      ? creator.avatar_url
      : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${creator.avatar_url}`
    : null;

  const formatBudget = () => {
    if (campaign.budget_min && campaign.budget_max) return `$${campaign.budget_min}–$${campaign.budget_max}`;
    if (campaign.budget_min) return `From $${campaign.budget_min}`;
    if (campaign.budget_max) return `Up to $${campaign.budget_max}`;
    return 'Budget TBD';
  };

  const getCtaConfig = () => {
    if (collaboration.status === 'completed') {
      return { label: 'Campaign Complete ✓', disabled: true, onClick: () => {} };
    }
    switch (currentStep) {
      case 'hired':
      case 'submitted':
        return { label: 'Waiting for Creator to Submit', disabled: true, onClick: () => {} };
      case 'review':
        return {
          label: 'Review & Approve Content →',
          disabled: false,
          onClick: () => navigate(`/dashboard/business/projects?highlight=${collaboration.id}`),
        };
      case 'payment':
        return {
          label: 'Mark Complete & Release Payment →',
          disabled: requestingId === collaboration.id,
          onClick: () => requestCompletion({ collaborationId: collaboration.id, userRole: 'business_client' }),
        };
      case 'review_left':
        return {
          label: 'Leave a Review →',
          disabled: false,
          onClick: () => setReviewModalOpen(true),
        };
      default:
        return { label: 'View Project', disabled: false, onClick: () => {} };
    }
  };

  const cta = getCtaConfig();

  const getEscrowLabel = () => {
    switch (campaign.escrow_status) {
      case 'held': return 'Escrow Held';
      case 'released': return 'Paid Out';
      case 'pending': return 'Payment Pending';
      default: return null;
    }
  };

  const getEscrowColor = () => {
    switch (campaign.escrow_status) {
      case 'held': return 'bg-green-100 text-green-800';
      case 'released': return 'bg-purple-100 text-purple-800';
      case 'pending': return 'bg-amber-100 text-amber-800';
      default: return '';
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-gray-100 md:max-w-4xl md:mx-auto">
        <PageHeader>
          <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="text-pink-500 mr-2">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Project Status
            </h1>
            <span className="w-5" />
          </div>
        </PageHeader>

        <div className="px-4 pt-4 pb-24 md:pb-8 space-y-3">
          {/* Campaign Header Card */}
          <div className="bg-white rounded-2xl p-4">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Campaign</span>
            <h2 className="font-bold text-lg text-gray-900 mt-1">{campaign.title}</h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge className="bg-green-100 text-green-800 text-xs">{campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}</Badge>
              {getEscrowLabel() && (
                <Badge className={`${getEscrowColor()} text-xs`}>{getEscrowLabel()}</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatBudget()}
              {campaign.deliverables?.length ? ` · ${campaign.deliverables.length} item${campaign.deliverables.length !== 1 ? 's' : ''}` : ''}
              {campaign.deadline ? ` · Due ${new Date(campaign.deadline).toLocaleDateString()}` : ''}
            </p>
          </div>

          {/* Assigned Creator Card */}
          <div className="bg-white rounded-2xl p-4 border-2 border-teal-400">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Assigned Creator</span>
            <div className="flex items-center gap-3 mt-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full ring-2 ring-teal-400 object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full ring-2 ring-teal-400 bg-gradient-to-br from-teal-300 to-pink-300 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
              )}
              <div>
                <p className="font-bold text-gray-900">{creator.creator_name}</p>
                <p className="text-xs text-gray-500">
                  {creator.rating !== null ? `${creator.rating.toFixed(1)} · ` : ''}
                  {creator.completed_projects} project{creator.completed_projects !== 1 ? 's' : ''} completed
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1 rounded-full bg-teal-400 text-white font-semibold text-xs hover:bg-teal-500"
                size="sm"
                onClick={() => navigate(`/dashboard/business/messages/campaign/${campaign.id}`)}
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-full border-gray-200 text-pink-500 font-semibold text-xs"
                size="sm"
                onClick={() => navigate(`/creator/${creator.user_id}`)}
              >
                <User className="h-3.5 w-3.5 mr-1" /> View Portfolio
              </Button>
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="bg-white rounded-2xl p-4">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Progress</span>
            <div className="mt-3 space-y-3">
              {STEPS.map((step, idx) => {
                const isComplete = idx < currentIdx || (idx === currentIdx && currentStep === 'review_left' && collaboration.status === 'completed');
                const isCurrent = idx === currentIdx && collaboration.status !== 'completed';
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isComplete ? 'bg-teal-400 text-white' :
                      isCurrent ? 'bg-yellow-400 text-white' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {isComplete ? '✓' : isCurrent ? <ArrowRight className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <span className={`text-sm ${
                      isComplete ? 'text-gray-900' :
                      isCurrent ? 'text-gray-900 font-bold' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary CTA */}
          <Button
            className={`w-full rounded-full font-bold py-3 text-[15px] ${
              cta.disabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-teal-400 text-white hover:bg-teal-500'
            }`}
            disabled={cta.disabled}
            onClick={cta.onClick}
          >
            {requestingId === collaboration.id ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
            ) : (
              cta.label
            )}
          </Button>
        </div>
      </div>

      {/* Rating Modal */}
      <RatingModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        collaborationId={collaboration.id}
        revieweeId={creator.user_id}
        revieweeName={creator.creator_name}
        reviewType="business_to_creator"
      />
    </DashboardLayout>
  );
}
