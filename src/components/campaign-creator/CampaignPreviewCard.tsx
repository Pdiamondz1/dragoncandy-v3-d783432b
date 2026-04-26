import type { EditableCampaign } from '@/types/campaignCreator';
import { mapDeliveryType } from '@/lib/campaignUtils';
import { TIER_LIMITS } from '@/types/campaignMedia';

interface CampaignPreviewCardProps {
  campaign: EditableCampaign;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube',
  google_business: 'Google Business', multi_platform: 'Multi-Platform',
};

export function CampaignPreviewCard({ campaign }: CampaignPreviewCardProps) {
  const tier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = tier ? TIER_LIMITS[tier] : null;

  return (
    <div className="sticky top-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">What creators will see</p>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="h-32 bg-gradient-to-br from-teal-400 to-emerald-400 flex items-center justify-center">
          <span className="text-5xl">{campaign.emoji}</span>
        </div>
        <div className="p-4 space-y-3">
          <h3 className="font-bold text-lg text-gray-900">{campaign.title || 'Untitled Campaign'}</h3>
          <p className="text-sm text-gray-600 line-clamp-3">{campaign.description || 'No description yet'}</p>
          <div className="flex flex-wrap gap-2">
            <span className="bg-teal-50 text-teal-700 rounded-full px-2 py-1 text-xs font-medium">
              ${campaign.budget_min}–${campaign.budget_max}
            </span>
            {tierConfig && (
              <span className="bg-gray-100 rounded-full px-2 py-1 text-xs font-medium text-gray-700">
                {tierConfig.label} · {tierConfig.timeframe}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {campaign.platforms.map((p) => (
              <span key={p} className="text-xs text-gray-500">{PLATFORM_LABELS[p] || p}</span>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {campaign.deliverables.length} deliverable{campaign.deliverables.length !== 1 ? 's' : ''} · Due {campaign.deadline || 'TBD'}
          </p>
        </div>
      </div>
    </div>
  );
}
