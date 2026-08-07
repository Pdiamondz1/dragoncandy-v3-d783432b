import { Badge } from '@/components/ui/badge';
import { AppCard } from '@/components/app/AppCard';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignOverviewSectionProps {
  campaign: Campaign;
}

export function CampaignOverviewSection({ campaign }: CampaignOverviewSectionProps) {
  return (
    <AppCard className="space-y-3">
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

        {/* line-clamp is load-bearing: legacy-wizard campaigns store free-text prose under this
            same key (see MAX_AUDIENCE_CHARS in src/lib/campaignAudience.ts), so it can run to a
            paragraph rather than the one line Donny now generates. */}
        {campaign.target_audience && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Made to attract</span>
            <p className="text-sm text-gray-700 line-clamp-3">{campaign.target_audience}</p>
          </div>
        )}

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
    </AppCard>
  );
}
