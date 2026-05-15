import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CampaignHero } from './CampaignHero';
import { CampaignMetricsBar } from './CampaignMetricsBar';
import { CampaignReferencesGallery } from './CampaignReferencesGallery';
import { CampaignFootageSection } from './CampaignFootageSection';
import { BusinessProfileStrip } from './BusinessProfileStrip';
import { InvitationBanner } from './InvitationBanner';
import { CampaignOverviewSection } from './sections/CampaignOverviewSection';
import { ContentRequirementsSection } from './sections/ContentRequirementsSection';
import { CompensationSection } from './sections/CompensationSection';
import { LogisticsSection } from './sections/LogisticsSection';
import { CollapsibleBriefSection } from './CollapsibleBriefSection';

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

      <div className="px-5 pt-4 pb-6 space-y-5">
        <CollapsibleBriefSection title="Campaign Overview" defaultOpen>
          <CampaignOverviewSection campaign={campaign} />
        </CollapsibleBriefSection>

        {enrichedDetail && (
          <CampaignReferencesGallery referenceMedia={enrichedDetail.referenceMedia} />
        )}

        {enrichedDetail && (
          <CampaignFootageSection
            footageItems={rawFootage}
            hasApplied={hasApplied ?? false}
          />
        )}

        <CollapsibleBriefSection title="Content Requirements" defaultOpen>
          <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
        </CollapsibleBriefSection>

        <CollapsibleBriefSection title="Compensation & Terms">
          <CompensationSection campaign={campaign} campaignId={campaign.id} role="creator" />
        </CollapsibleBriefSection>

        <CollapsibleBriefSection title="Logistics & Targeting">
          <LogisticsSection campaign={campaign} />
        </CollapsibleBriefSection>

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
