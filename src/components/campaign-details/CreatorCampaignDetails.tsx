// src/components/campaign-details/CreatorCampaignDetails.tsx

import { Globe, Users } from 'lucide-react';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CampaignHero } from './CampaignHero';
import { CampaignMetricsBar } from './CampaignMetricsBar';
import { CampaignBriefSection } from './CampaignBriefSection';
import { CampaignReferencesGallery } from './CampaignReferencesGallery';
import { CampaignFootageSection } from './CampaignFootageSection';
import { CampaignDeliverablesBreakdown } from './CampaignDeliverablesBreakdown';
import { CampaignTimeline } from './CampaignTimeline';
import { CampaignBudgetDetail } from './CampaignBudgetDetail';
import { CampaignDetailSection } from './CampaignDetailSection';
import { BusinessProfileStrip } from './BusinessProfileStrip';
import { InvitationBanner } from './InvitationBanner';

interface CreatorCampaignDetailsProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  isInvited?: boolean;
  hasApplied?: boolean;
}

export function CreatorCampaignDetails({
  campaign,
  enrichedDetail,
  isInvited,
  hasApplied,
}: CreatorCampaignDetailsProps) {
  const businessName =
    (campaign.ai_analysis as Record<string, unknown>)?.business_name as string | undefined;

  const rawFootage = enrichedDetail?.media.filter((m) => m.media_type === 'raw_footage') ?? [];

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <CampaignHero
        campaign={campaign}
        media={enrichedDetail?.media}
        businessLogoUrl={enrichedDetail?.businessProfile?.logo_url}
        distance={undefined}
        applicationCount={enrichedDetail?.applicationCount}
      />

      {isInvited && <InvitationBanner businessName={businessName} />}

      <CampaignMetricsBar
        campaign={campaign}
        deliverableCount={enrichedDetail?.deliverables.length ?? campaign.deliverables?.length ?? 0}
        matchScore={enrichedDetail?.matchScore ?? null}
      />

      <div className="px-5 pt-4 pb-6 space-y-0">
        <CampaignBriefSection
          description={campaign.description}
          goals={campaign.goals}
          style={campaign.style}
          tone={campaign.tone}
          targetPersonas={campaign.target_creator_personas}
          tagline={campaign.tagline}
          campaignType={campaign.campaign_type}
          hashtags={campaign.hashtag_requirements}
        />

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <CampaignDeliverablesBreakdown
          deliverables={enrichedDetail?.deliverables ?? []}
          fallbackDeliverables={campaign.deliverables}
        />

        <CampaignTimeline
          deliveryType={campaign.delivery_type}
          deadline={campaign.deadline}
        />

        <CampaignBudgetDetail campaign={campaign} />

        {(campaign.geographic_scope || campaign.creator_count) && (
          <CampaignDetailSection title="Scope">
            <div className="flex flex-wrap gap-4">
              {campaign.geographic_scope && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-dc-teal" />
                  <div>
                    <span className="text-[11px] text-gray-500 uppercase">Geographic Scope</span>
                    <p className="text-sm font-medium text-gray-900 capitalize">{campaign.geographic_scope}</p>
                  </div>
                </div>
              )}
              {campaign.creator_count != null && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-dc-teal" />
                  <div>
                    <span className="text-[11px] text-gray-500 uppercase">Target Creators</span>
                    <p className="text-sm font-medium text-gray-900">{campaign.creator_count}</p>
                  </div>
                </div>
              )}
            </div>
          </CampaignDetailSection>
        )}

        {enrichedDetail?.businessProfile && (
          <div className="mt-3">
            <BusinessProfileStrip
              profile={enrichedDetail.businessProfile}
              completedCampaignCount={enrichedDetail.completedCampaignCount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
