import { Calendar, Clock, Sparkles, Rocket, Package } from 'lucide-react';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignTimelineProps {
  deliveryType?: string | null;
  deadline?: string | null;
}

const TIER_TIMEFRAMES: Record<string, { icon: typeof Sparkles; text: string }> = {
  dragonrush: { icon: Sparkles, text: 'Due 1–3 hours after acceptance' },
  expedited: { icon: Rocket, text: 'Due 48 hours after acceptance' },
  standard: { icon: Package, text: 'Due in 5–7 days' },
};

export function CampaignTimeline({ deliveryType, deadline }: CampaignTimelineProps) {
  if (!deliveryType && !deadline) return null;

  const tier = deliveryType ? TIER_TIMEFRAMES[deliveryType] : null;

  return (
    <CampaignDetailSection title="Timeline & Deadline">
      <div className="space-y-2">
        {tier && (
          <div className="flex items-center gap-2">
            <tier.icon className="w-4 h-4 text-dc-teal" />
            <Clock className="w-4 h-4 text-dc-teal" />
            <span className="text-sm text-gray-700">{tier.text}</span>
          </div>
        )}
        {deadline && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-dc-teal" />
            <span className="text-sm text-gray-700">
              Deadline:{' '}
              {new Date(deadline).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>
    </CampaignDetailSection>
  );
}
