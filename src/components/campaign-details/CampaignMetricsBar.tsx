import { formatBudget } from '@/lib/campaignUtils';

interface CampaignMetricsBarProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    delivery_type?: string | null;
  };
  deliverableCount: number;
  matchScore: number | null;
}

const TIER_CONFIG: Record<string, { emoji: string; label: string; timeframe: string; bg: string }> = {
  dragonrush: { emoji: '🐉', label: 'DragonDash', timeframe: '1–3 hrs', bg: 'bg-teal-500 text-white' },
  expedited: { emoji: '🚀', label: 'Express', timeframe: '24–48 hrs', bg: 'bg-pink-400 text-white' },
  standard: { emoji: '📅', label: 'Standard', timeframe: '5–7 days', bg: 'bg-gray-200 text-gray-700' },
};

export function CampaignMetricsBar({ campaign, deliverableCount, matchScore }: CampaignMetricsBarProps) {
  const tier = campaign.delivery_type ? TIER_CONFIG[campaign.delivery_type] : null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-white border-b border-gray-100">
      <span className="text-sm font-bold text-dc-teal">{formatBudget(campaign)}</span>
      <span className="text-gray-300">·</span>
      <span className="text-sm text-gray-600">
        {deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}
      </span>
      {tier && (
        <>
          <span className="text-gray-300">·</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tier.bg}`}>
            {tier.emoji} {tier.label}
          </span>
        </>
      )}
      {matchScore != null && (
        <>
          <span className="text-gray-300">·</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-700">
            {matchScore}% Match
          </span>
        </>
      )}
    </div>
  );
}
