import { Calendar, Clock } from 'lucide-react';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignTimelineProps {
  deliveryType?: string | null;
  deadline?: string | null;
}

const TIER_TIMEFRAMES: Record<string, string> = {
  dragonrush: 'Due 1–3 hours after acceptance',
  expedited: 'Due 48 hours after acceptance',
  standard: 'Due in 5–7 days',
};

export function CampaignTimeline({ deliveryType, deadline }: CampaignTimelineProps) {
  if (!deliveryType && !deadline) return null;

  const timeframe = deliveryType ? TIER_TIMEFRAMES[deliveryType] : null;

  return (
    <CampaignDetailSection title="Timeline & Deadline">
      <div className="space-y-2">
        {timeframe && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-dc-teal" />
            <span className="text-sm text-gray-700">{timeframe}</span>
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
