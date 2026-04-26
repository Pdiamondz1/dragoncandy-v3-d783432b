import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignHeroProps {
  campaign: Campaign;
}

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CampaignHero({ campaign }: CampaignHeroProps) {
  const navigate = useNavigate();
  const tierLabel = campaign.delivery_type ? TIER_LABELS[campaign.delivery_type] ?? 'Standard' : 'Standard';
  const tierEmoji = campaign.delivery_type === 'dragonrush' ? '🐉' : campaign.delivery_type === 'expedited' ? '⚡' : '📦';
  const emoji = (campaign.ai_analysis as Record<string, unknown>)?.emoji as string ?? '📣';
  const businessName = (campaign.ai_analysis as Record<string, unknown>)?.business_name as string | undefined;
  const tagline = campaign.tagline;
  const campaignType = campaign.campaign_type?.replace(/_/g, ' ') ?? 'Campaign';

  return (
    <div className="relative bg-gradient-to-br from-dc-teal to-dc-teal-dark px-5 pt-5 pb-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-4"
        aria-label="Back"
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white" />
        </div>
        <span className="text-white/85 text-sm font-medium">Back</span>
      </button>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">{emoji}</span>
        <div>
          <h1 className="text-xl font-bold text-white">{campaign.title}</h1>
          <span className="text-xs text-white/80 capitalize">
            {campaignType}{businessName ? ` · ${businessName}` : ''}
          </span>
        </div>
      </div>

      {tagline && (
        <p className="text-white/90 text-sm italic">"{tagline}"</p>
      )}

      <div className="absolute top-5 right-5 bg-black/25 px-3 py-1 rounded-full">
        <span className="text-white text-xs font-semibold">{tierEmoji} {tierLabel}</span>
      </div>
    </div>
  );
}
