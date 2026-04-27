import { Camera, Film, Layers, Smartphone } from 'lucide-react';
import type { CampaignDeliverable } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignDeliverablesBreakdownProps {
  deliverables: CampaignDeliverable[];
  fallbackDeliverables?: string[] | null;
}

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera className="w-4 h-4 text-dc-teal" />,
  video_reel: <Film className="w-4 h-4 text-dc-teal" />,
  story: <Smartphone className="w-4 h-4 text-dc-teal" />,
  carousel: <Layers className="w-4 h-4 text-dc-teal" />,
  tiktok: <Film className="w-4 h-4 text-dc-teal" />,
  youtube_short: <Film className="w-4 h-4 text-dc-teal" />,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  photo: 'Photo',
  video_reel: 'Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YT Short',
};

export function CampaignDeliverablesBreakdown({
  deliverables,
  fallbackDeliverables,
}: CampaignDeliverablesBreakdownProps) {
  if (deliverables.length === 0 && (!fallbackDeliverables || fallbackDeliverables.length === 0)) {
    return null;
  }

  return (
    <CampaignDetailSection title="Deliverables">
      {deliverables.length > 0 ? (
        <div className="space-y-2">
          {deliverables.map((d, i) => (
            <div key={d.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
              <span className="text-sm font-bold text-gray-400 mt-0.5 w-5 text-right">{i + 1}.</span>
              {CONTENT_TYPE_ICONS[d.content_type] ?? <Camera className="w-4 h-4 text-dc-teal mt-0.5" />}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900">
                  {CONTENT_TYPE_LABELS[d.content_type] ?? d.content_type}
                </span>
                <span className="text-xs text-gray-500 ml-1.5 capitalize">({d.platform.replace(/_/g, ' ')})</span>
                {d.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{d.description}</p>
                )}
                {d.aspect_ratio && (
                  <span className="text-[10px] text-gray-400 mt-0.5 block">{d.aspect_ratio}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {fallbackDeliverables!.map((d, i) => (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
              {i + 1}. {d}
            </div>
          ))}
        </div>
      )}
    </CampaignDetailSection>
  );
}
