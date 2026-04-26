import type { Deliverable } from '@/types/campaignMedia';
import { X } from 'lucide-react';

interface DeliverablesListProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
}

function formatDeliverable(d: Deliverable): string {
  const typeLabels: Record<string, string> = {
    photo: 'Photo', video_reel: 'Reel', story: 'Story',
    carousel: 'Carousel', tiktok: 'TikTok', youtube_short: 'YT Short',
  };
  const platformLabels: Record<string, string> = {
    instagram: 'IG', tiktok: 'TT', facebook: 'FB',
    youtube: 'YT', google_business: 'Google', multi_platform: 'Multi',
  };
  return `${typeLabels[d.content_type] || d.content_type} · ${platformLabels[d.platform] || d.platform} · ${d.aspect_ratio}`;
}

export function DeliverablesList({ deliverables, onChange }: DeliverablesListProps) {
  const remove = (id: string) => onChange(deliverables.filter((d) => d.id !== id));

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deliverables</label>
      <div className="mt-2 space-y-2">
        {deliverables.map((d) => (
          <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">{formatDeliverable(d)}</p>
              {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
            </div>
            <button type="button" onClick={() => remove(d.id)} className="text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
