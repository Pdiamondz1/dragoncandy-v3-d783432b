import { useState } from 'react';
import type { Deliverable, ContentType, Platform, AspectRatio } from '@/types/campaignMedia';
import { Camera, Film, Smartphone, Layers, Plus, X } from 'lucide-react';

interface DeliverablesListProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
}

const CONTENT_OPTIONS: { type: ContentType; label: string; icon: typeof Camera; defaultPlatform: Platform; defaultRatio: AspectRatio }[] = [
  { type: 'photo', label: 'Photo', icon: Camera, defaultPlatform: 'instagram', defaultRatio: '1:1' },
  { type: 'video_reel', label: 'Reel', icon: Film, defaultPlatform: 'instagram', defaultRatio: '9:16' },
  { type: 'story', label: 'Story', icon: Smartphone, defaultPlatform: 'instagram', defaultRatio: '9:16' },
  { type: 'tiktok', label: 'TikTok', icon: Film, defaultPlatform: 'tiktok', defaultRatio: '9:16' },
  { type: 'youtube_short', label: 'YouTube Short', icon: Film, defaultPlatform: 'youtube', defaultRatio: '9:16' },
  { type: 'carousel', label: 'Carousel', icon: Layers, defaultPlatform: 'instagram', defaultRatio: '1:1' },
];

const TYPE_ICONS: Record<string, typeof Camera> = {
  photo: Camera, video_reel: Film, story: Smartphone,
  carousel: Layers, tiktok: Film, youtube_short: Film,
};

const TYPE_LABELS: Record<string, string> = {
  photo: 'Photo', video_reel: 'Reel', story: 'Story',
  carousel: 'Carousel', tiktok: 'TikTok', youtube_short: 'YT Short',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
  youtube: 'YouTube', google_business: 'Google', multi_platform: 'Multi-Platform',
};

export function DeliverablesList({ deliverables, onChange }: DeliverablesListProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const remove = (id: string) => onChange(deliverables.filter((d) => d.id !== id));

  const addDeliverable = (option: typeof CONTENT_OPTIONS[0]) => {
    const newDeliverable: Deliverable = {
      id: crypto.randomUUID(),
      content_type: option.type,
      platform: option.defaultPlatform,
      aspect_ratio: option.defaultRatio,
    };
    onChange([...deliverables, newDeliverable]);
    setShowAddMenu(false);
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deliverables</label>
      <p className="text-xs text-gray-500 mt-1">Each item is one piece of content the creator will produce and deliver</p>
      <div className="mt-2 space-y-2">
        {deliverables.map((d, i) => {
          const Icon = TYPE_ICONS[d.content_type] || Camera;
          return (
            <div key={d.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-dc-teal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {i + 1}. {TYPE_LABELS[d.content_type] || d.content_type}
                </p>
                <p className="text-xs text-gray-500">
                  {PLATFORM_LABELS[d.platform] || d.platform} · {d.aspect_ratio}
                </p>
                {d.description && <p className="text-xs text-gray-400 mt-0.5">{d.description}</p>}
              </div>
              <button type="button" onClick={() => remove(d.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Content button */}
      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex items-center gap-1.5 text-sm font-medium text-dc-teal hover:text-dc-teal-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Content
        </button>

        {showAddMenu && (
          <div className="absolute left-0 top-8 z-10 bg-white rounded-xl border border-gray-200 shadow-lg py-1 w-52">
            {CONTENT_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => addDeliverable(option)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-teal-50 transition-colors"
                >
                  <Icon className="w-4 h-4 text-dc-teal" />
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary line */}
      {deliverables.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          {deliverables.length} deliverable{deliverables.length !== 1 ? 's' : ''}: {
            Object.entries(
              deliverables.reduce<Record<string, number>>((acc, d) => {
                const label = TYPE_LABELS[d.content_type] || d.content_type;
                acc[label] = (acc[label] || 0) + 1;
                return acc;
              }, {})
            ).map(([label, count]) => `${count} ${label}${count > 1 ? 's' : ''}`).join(', ')
          }
        </p>
      )}
    </div>
  );
}
