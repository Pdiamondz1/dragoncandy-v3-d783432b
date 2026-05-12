import React from 'react';
import { CollapsibleBriefSection } from '@/components/campaign-details/CollapsibleBriefSection';
import { CampaignOverviewSection } from '@/components/campaign-details/sections/CampaignOverviewSection';
import { ContentRequirementsSection } from '@/components/campaign-details/sections/ContentRequirementsSection';
import { CompensationSection } from '@/components/campaign-details/sections/CompensationSection';
import { LogisticsSection } from '@/components/campaign-details/sections/LogisticsSection';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CampaignPhase } from '@/lib/campaignPhase';
import { formatBudget } from '@/lib/campaignPhase';

interface CollapsibleCampaignDetailsProps {
  campaign: Campaign;
  phase: CampaignPhase;
}

function buildOverviewSubtitle(campaign: Campaign): string {
  const parts: string[] = [];
  const budget = formatBudget(campaign);
  if (budget) parts.push(budget);
  if (campaign.platforms?.length) parts.push(campaign.platforms.slice(0, 2).join(', '));
  return parts.join(' · ');
}

export const CollapsibleCampaignDetails: React.FC<CollapsibleCampaignDetailsProps> = ({
  campaign,
  phase,
}) => {
  const overviewOpen = phase === 'pre_hire' || phase === 'cancelled';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden lg:sticky lg:top-4 p-4 space-y-1">
      <CollapsibleBriefSection
        title="Campaign Overview"
        subtitle={buildOverviewSubtitle(campaign)}
        defaultOpen={overviewOpen}
      >
        <CampaignOverviewSection campaign={campaign} />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Content Requirements">
        <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Compensation & Terms">
        <CompensationSection campaign={campaign} campaignId={campaign.id} role="business" />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Logistics & Targeting">
        <LogisticsSection campaign={campaign} />
      </CollapsibleBriefSection>
    </div>
  );
};
