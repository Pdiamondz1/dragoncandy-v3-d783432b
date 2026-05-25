import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { ProjectStepper, getCreatorStep } from '@/components/projects/ProjectStepper';
import { DeliverableCard } from '@/components/projects/DeliverableCard';
import { ProjectFileUpload } from '@/components/projects/ProjectFileUpload';
import { SubmitForReviewButton } from '@/components/campaigns/SubmitForReviewButton';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useFileUploads } from '@/hooks/useFileQuery';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { supabase } from '@/integrations/supabase/client';
import { SocialNudgeBanner } from '@/components/campaigns/SocialNudgeBanner';

interface ActivePhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  collaborationId: string;
}

type ActiveTab = 'project' | 'brief';

export function ActivePhaseView({ campaign, enrichedDetail, collaborationId }: ActivePhaseViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('project');
  const [activeDeliverableUpload, setActiveDeliverableUpload] = useState<{
    id: string;
    label: string;
    contentType: string;
  } | null>(null);
  const navigate = useNavigate();
  const [showCrossPost, setShowCrossPost] = useState(false);

  const { data: collaboration } = useCollaboration(collaborationId);
  const { data: files } = useFileUploads(collaboration?.campaign_id, 'deliverable');
  const { data: deliverables } = useCampaignDeliverables(campaign.id);

  const totalDeliverables = (deliverables?.length ?? 0)
    || (campaign.campaign_deliverables?.length ?? 0)
    || (campaign.deliverables?.length ?? 0);
  const uploadedCount = deliverables?.filter((d) => {
    const match = files?.find(
      (f) => (f.metadata as Record<string, unknown>)?.deliverable_id === d.id,
    );
    return !!match;
  }).length ?? 0;

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'project', label: 'PROJECT' },
    { id: 'brief', label: 'BRIEF' },
  ];

  if (!collaboration) return null;

  const deliverablesStatus = collaboration.deliverables_status as Record<string, string> | null;
  const campaignDeliverables = (collaboration.campaign?.ai_analysis?.deliverables as
    | { id: string; content_type: string; platform?: string; description?: string }[]
    | undefined);
  const hasUploadedFiles = (files?.length ?? 0) > 0;
  const currentStep = getCreatorStep(collaboration.content_status, hasUploadedFiles);
  const tierColor = collaboration.campaign?.delivery_type === 'dragonrush' ? '#EF4444' :
    collaboration.campaign?.delivery_type === 'expedited' ? '#F59E0B' : '#4DD9C0';

  return (
    <div>
      {/* Tabs — mobile only */}
      <div className="flex bg-white border-b border-gray-200 lg:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-3 text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? 'text-dc-teal border-b-[3px] border-dc-teal'
                : 'text-gray-400 border-b-[3px] border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-column on desktop, tab-switched on mobile */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:pt-6 lg:pb-8 lg:items-start">
        {/* Left: Project workflow — cohesive card on desktop */}
        <div className={`px-4 pt-4 pb-24 space-y-3 lg:px-0 lg:pb-0 lg:sticky lg:top-24 ${activeTab !== 'project' ? 'hidden lg:block' : ''}`}>
          <div className="lg:bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-100 lg:p-6 space-y-5">
            <div className="text-sm font-bold text-gray-900 hidden lg:block">PROJECT WORKFLOW</div>

            {/* Stepper */}
            <div className="bg-white rounded-2xl p-4 lg:bg-transparent lg:p-0">
              <ProjectStepper currentStep={currentStep} role="creator" tierColor={tierColor} />
            </div>

            <div className="hidden lg:block border-t border-gray-100" />

            {/* Deliverables */}
            {campaignDeliverables && campaignDeliverables.length > 0 && (
              <>
                <div className="bg-white rounded-2xl p-4 space-y-3 lg:bg-transparent lg:p-0">
                  <div className="text-sm font-bold text-gray-900 lg:text-xs lg:text-gray-500 lg:uppercase lg:tracking-wider">DELIVERABLES</div>
                  {campaignDeliverables.map((d) => {
                    const status = (deliverablesStatus?.[d.id] as 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved') || 'pending';
                    const matchingFile = files?.find(
                      (f) => f.original_filename?.includes(d.id) || (f.metadata as Record<string, unknown>)?.deliverable_id === d.id,
                    );
                    return (
                      <DeliverableCard
                        key={d.id}
                        deliverable={d}
                        status={status}
                        uploadedFile={matchingFile ? { file_name: matchingFile.original_filename, file_size_bytes: matchingFile.file_size } : null}
                        feedback={collaboration.revision_feedback?.[d.id] ?? null}
                        disabled={collaboration.campaign?.escrow_status !== 'held'}
                        onUpload={() => setActiveDeliverableUpload({
                          id: d.id,
                          label: `${d.platform ?? ''} ${d.content_type}`.trim(),
                          contentType: d.content_type,
                        })}
                      />
                    );
                  })}
                </div>
                <div className="hidden lg:block border-t border-gray-100" />
              </>
            )}

            {/* Per-deliverable upload dialog (controlled) */}
            <ProjectFileUpload
              campaignId={collaboration.campaign_id}
              campaignTitle={collaboration.campaign?.title || campaign.title}
              deliverableId={activeDeliverableUpload?.id}
              deliverableLabel={activeDeliverableUpload?.label}
              acceptFilter={
                ['video_reel', 'tiktok', 'youtube_short', 'story'].includes(activeDeliverableUpload?.contentType ?? '')
                  ? 'video/*'
                  : activeDeliverableUpload?.contentType === 'photo'
                    ? 'image/*'
                    : undefined
              }
              open={!!activeDeliverableUpload}
              onOpenChange={(open) => { if (!open) setActiveDeliverableUpload(null); }}
              onUploadComplete={() => setActiveDeliverableUpload(null)}
            />

            {/* Fallback upload button for non-deliverable files */}
            <div className="flex justify-center">
              <ProjectFileUpload
                campaignId={collaboration.campaign_id}
                campaignTitle={collaboration.campaign?.title || campaign.title}
              />
            </div>

            {/* Submit for Review */}
            <SubmitForReviewButton
              collaborationId={collaborationId}
              campaignId={campaign.id}
              uploadedCount={uploadedCount}
              totalCount={totalDeliverables}
              contentStatus={collaboration.content_status ?? 'pending'}
            />

            <div className="hidden lg:block border-t border-gray-100" />

            {/* Messages CTA */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3 px-6"
                onClick={() => navigate(`/messages/${collaboration.campaign_id}`)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Open Messages
              </Button>
            </div>
          </div>

          <SocialNudgeBanner
            campaignId={campaign.id}
            socialManagerPath="/dashboard/creator/social"
          />

          {/* Cross-post prompt (shown when content is approved) */}
          {collaboration?.content_status === 'approved' && (
            <DragonCandyOutstandProvider>
              <CrossPostPrompt
                open={showCrossPost}
                onOpenChange={setShowCrossPost}
                campaignId={campaign.id}
                campaignTitle={campaign.title}
                creatorName={collaboration?.creator_profile?.creator_name ?? ''}
                mediaUrls={
                  files
                    ?.map((f) => supabase.storage.from(f.bucket_name).getPublicUrl(f.file_path).data.publicUrl)
                    .filter(Boolean) as string[] ?? []
                }
                originalCaption=""
              />
            </DragonCandyOutstandProvider>
          )}

          {collaboration?.content_status === 'approved' && !showCrossPost && (
            <Button
              variant="outline"
              className="w-full rounded-full border-dc-pink-accent text-dc-pink-accent font-semibold"
              onClick={() => setShowCrossPost(true)}
            >
              Share to Your Socials
            </Button>
          )}
        </div>

        {/* Right: Campaign brief */}
        <div className={`px-4 pt-4 pb-24 lg:px-0 lg:pb-0 ${activeTab !== 'brief' ? 'hidden lg:block' : ''}`}>
          <div className="text-sm font-bold text-gray-900 mb-3 hidden lg:block">CAMPAIGN BRIEF</div>
          <div className="lg:shadow-sm lg:rounded-2xl lg:border lg:border-gray-100">
            <CreatorCampaignDetails
              campaign={campaign}
              enrichedDetail={enrichedDetail}
              hasApplied={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
