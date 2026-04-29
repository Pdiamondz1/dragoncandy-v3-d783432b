import { Badge } from '@/components/ui/badge';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignOverviewSectionProps {
  campaign: Campaign;
}

export function CampaignOverviewSection({ campaign }: CampaignOverviewSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Campaign Overview</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Title</span>
          <p className="text-base font-semibold text-gray-900">{campaign.title}</p>
        </div>

        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Tagline</span>
          {campaign.tagline ? (
            <p className="text-sm text-gray-600 italic">{campaign.tagline}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">No tagline</p>
          )}
        </div>

        {campaign.description && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Description</span>
            <p className="text-sm text-gray-600 leading-relaxed">{campaign.description}</p>
          </div>
        )}

        {campaign.campaign_type && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Campaign Type</span>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize">
                {campaign.campaign_type.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
