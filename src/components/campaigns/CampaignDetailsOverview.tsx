import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';
import { CampaignOverviewSection } from '@/components/campaign-details/sections/CampaignOverviewSection';
import { ContentRequirementsSection } from '@/components/campaign-details/sections/ContentRequirementsSection';
import { CompensationSection } from '@/components/campaign-details/sections/CompensationSection';
import { LogisticsSection } from '@/components/campaign-details/sections/LogisticsSection';

interface CampaignDetailsOverviewProps {
  campaign: Campaign;
}

export const CampaignDetailsOverview: React.FC<CampaignDetailsOverviewProps> = ({ campaign }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
        </Badge>
      </div>

      <CampaignOverviewSection campaign={campaign} />
      <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
      <CompensationSection campaign={campaign} campaignId={campaign.id} role="business" />
      <LogisticsSection campaign={campaign} />
    </div>
  );
};

