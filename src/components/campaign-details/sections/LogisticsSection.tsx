import { Calendar, Globe, Users } from 'lucide-react';
import { Sparkles, Rocket, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface LogisticsSectionProps {
  campaign: Campaign;
}

export function LogisticsSection({ campaign }: LogisticsSectionProps) {
  const tier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = tier ? TIER_LIMITS[tier] : null;

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const TierIcon = campaign.delivery_type === 'dragonrush' ? Sparkles
    : campaign.delivery_type === 'expedited' ? Rocket
    : Package;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Deadline</span>
            <p className="text-sm font-medium text-gray-900">{formatDate(campaign.deadline)}</p>
          </div>
        </div>

        {tierConfig && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Delivery Tier</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                campaign.delivery_type === 'dragonrush' ? 'bg-teal-100 text-teal-800' :
                campaign.delivery_type === 'expedited' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-700'
              }`}>
                <TierIcon className="w-3.5 h-3.5" />
                {tierConfig.label} · {tierConfig.timeframe}
              </span>
            </div>
            {campaign.tier_reasoning && (
              <p className="text-xs text-gray-500 mt-1 italic">{campaign.tier_reasoning}</p>
            )}
          </div>
        )}

        {campaign.geographic_scope && (
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Geographic Scope</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {(['city', 'region', 'national'] as const).map((scope) => (
                  <Badge
                    key={scope}
                    variant={campaign.geographic_scope === scope ? 'default' : 'outline'}
                    className={`capitalize ${campaign.geographic_scope === scope ? 'bg-dc-teal-btn text-white' : ''}`}
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {campaign.creator_count != null && (
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Target Creator Count</span>
              <p className="text-sm font-medium text-gray-900">{campaign.creator_count}</p>
            </div>
          </div>
        )}

        {campaign.target_creator_personas && campaign.target_creator_personas.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Target Creators</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.target_creator_personas.map((persona, i) => (
                <Badge key={i} variant="outline" className="capitalize">
                  {persona}
                </Badge>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
