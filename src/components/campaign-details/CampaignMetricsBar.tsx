import { Sparkles, Rocket, Package } from 'lucide-react';
import { formatBudget } from '@/lib/campaignUtils';
import { useAgreedValue } from '@/hooks/useAgreedValue';

interface CampaignMetricsBarProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    delivery_type?: string | null;
  };
  campaignId?: string;
  deliverableCount: number;
  matchScore: number | null;
}

const TIER_CONFIG: Record<string, { icon: typeof Sparkles; label: string; timeframe: string; bg: string }> = {
  dragonrush: { icon: Sparkles, label: 'DragonDash', timeframe: '1–3 hrs', bg: 'bg-teal-500 text-white' },
  expedited: { icon: Rocket, label: 'Express', timeframe: '24–48 hrs', bg: 'bg-pink-400 text-white' },
  standard: { icon: Package, label: 'Standard', timeframe: '5–7 days', bg: 'bg-gray-200 text-gray-700' },
};

export function CampaignMetricsBar({ campaign, campaignId, deliverableCount, matchScore }: CampaignMetricsBarProps) {
  const tier = campaign.delivery_type ? TIER_CONFIG[campaign.delivery_type] : null;
  const { data: agreedValue } = useAgreedValue(campaignId);
  const budgetDisplay = agreedValue != null ? `$${agreedValue.toLocaleString()}` : formatBudget(campaign);

  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-white border-b border-gray-100 sticky top-0 z-10">
      <span className="text-sm font-bold text-dc-teal">{budgetDisplay}</span>
      <span className="text-gray-300">·</span>
      <span className="text-sm text-gray-600">
        {deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}
      </span>
      {tier && (
        <>
          <span className="text-gray-300">·</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${tier.bg}`}>
            <tier.icon className="w-3 h-3" />
            {tier.label}
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
