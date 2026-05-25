import { useParams } from 'react-router-dom';
import { useCampaignById } from '@/hooks/useCampaignQueries';
import { useCampaignDetailEnriched } from '@/hooks/useCampaignDetailEnriched';
import { useCreatorApplications } from '@/hooks/useCreatorApplications';
import { useCreatorCollaborations } from '@/hooks/useCreatorCollaborations';
import { useAgreedValue } from '@/hooks/useAgreedValue';
import { CampaignDetailHeader } from '@/components/my-campaigns/CampaignDetailHeader';
import { AppliedPhaseView } from '@/components/my-campaigns/AppliedPhaseView';
import { ActivePhaseView } from '@/components/my-campaigns/ActivePhaseView';
import { CompletedPhaseView } from '@/components/my-campaigns/CompletedPhaseView';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardLayout } from '@/components/DashboardLayout';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';

type Phase = 'applied' | 'active' | 'completed';
type Stat = { label: string; value: string; color?: string };

function buildStats(
  phase: Phase,
  campaign: Campaign,
  activeCollab?: CreatorCollaboration | null,
  completedCollab?: CreatorCollaboration | null,
  agreedValue?: number | null,
): Stat[] {
  if (phase === 'active') {
    const price = agreedValue ?? campaign.fixed_price ?? campaign.budget_min ?? 0;
    const deadline = activeCollab?.content_deadline || campaign.deadline;
    const daysLeft = deadline
      ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
      : null;
    return [
      { label: 'Value', value: `$${price.toLocaleString()}` },
      {
        label: 'Deadline',
        value: deadline
          ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '—',
      },
      ...(daysLeft != null
        ? [{ label: 'Remaining', value: `${daysLeft} days`, color: daysLeft <= 2 ? 'text-red-500' : undefined }]
        : []),
    ];
  }
  if (phase === 'completed') {
    const price = agreedValue ?? campaign.fixed_price ?? campaign.budget_min ?? 0;
    const completedDate = completedCollab?.completed_at
      ? new Date(completedCollab.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '—';
    const rating = completedCollab?.existing_review_rating;
    return [
      { label: 'Earned', value: `$${price}` },
      { label: 'Completed', value: completedDate },
      ...(rating ? [{ label: 'Rating', value: `⭐ ${rating}` }] : []),
    ];
  }
  return [];
}

export default function MyCampaignDetailPage() {
  const { id: campaignId } = useParams<{ id: string }>();

  const { data: campaign, isLoading: campaignLoading } = useCampaignById(campaignId!);
  const { data: enrichedDetail } = useCampaignDetailEnriched(campaignId ?? null, campaign?.user_id ?? null);
  const { data: agreedValue } = useAgreedValue(campaignId);
  const { data: applications = [] } = useCreatorApplications();
  const { data: activeCollabs = [] } = useCreatorCollaborations('active');
  const { data: completedCollabs = [] } = useCreatorCollaborations('completed');

  const application = applications.find((a) => a.campaign_id === campaignId);
  const activeCollab = activeCollabs.find((c) => c.campaign_id === campaignId);
  const completedCollab = completedCollabs.find((c) => c.campaign_id === campaignId);

  if (campaignLoading) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="min-h-screen bg-white p-4 space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="min-h-screen bg-white flex items-center justify-center">
          <p className="text-gray-600">Campaign not found</p>
        </div>
      </DashboardLayout>
    );
  }

  // Phase detection: active > completed > applied
  const phase: Phase = activeCollab ? 'active' : completedCollab ? 'completed' : 'applied';
  const stats = buildStats(phase, campaign, activeCollab, completedCollab, agreedValue);

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white lg:max-w-5xl lg:mx-auto">
        <CampaignDetailHeader
          campaign={campaign}
          phase={phase}
          stats={stats}
          applicationStatus={application?.status}
        />

        {phase === 'active' && activeCollab && (
          <ActivePhaseView
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            collaborationId={activeCollab.id}
          />
        )}

        {phase === 'completed' && completedCollab && (
          <CompletedPhaseView
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            collaboration={completedCollab}
          />
        )}

        {phase === 'applied' && application && (
          <AppliedPhaseView
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            application={application}
          />
        )}

        {phase === 'applied' && !application && (
          <div className="px-4 pt-4 pb-24">
            <p className="text-gray-500 text-center">No application found for this campaign.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
