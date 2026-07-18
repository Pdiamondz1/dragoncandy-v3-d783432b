import { Plus, Trash2 } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { AppCard } from '@/components/app/AppCard';
import { AppChip } from '@/components/app/AppChip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { Deliverable, ContentType } from '@/types/campaignMedia';

interface DeliverableBuilderProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
  maxDeliverables?: number;
  allowedContentTypes?: ContentType[];
}

const CONTENT_TYPE_OPTIONS: { value: Deliverable['content_type']; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'video_reel', label: 'Video Reel' },
  { value: 'story', label: 'Story' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_short', label: 'YouTube Short' },
];

const PLATFORM_OPTIONS: { value: Deliverable['platform']; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google_business', label: 'Google Business' },
  { value: 'multi_platform', label: 'Multi-Platform' },
];

const ASPECT_RATIO_OPTIONS: Deliverable['aspect_ratio'][] = ['9:16', '16:9', '1:1', '4:5'];

const VIDEO_CONTENT_TYPES: Deliverable['content_type'][] = [
  'video_reel',
  'story',
  'tiktok',
  'youtube_short',
];

const DEFAULT_DELIVERABLE: Omit<Deliverable, 'id'> = {
  content_type: 'video_reel',
  platform: 'instagram',
  aspect_ratio: '9:16',
};

export function DeliverableBuilder({
  deliverables,
  onChange,
  maxDeliverables = 10,
  allowedContentTypes,
}: DeliverableBuilderProps) {
  const isVideoType = (contentType: Deliverable['content_type']) =>
    VIDEO_CONTENT_TYPES.includes(contentType);

  const updateDeliverable = (id: string, updates: Partial<Deliverable>) => {
    onChange(
      deliverables.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const removeDeliverable = (id: string) => {
    if (deliverables.length <= 1) return;
    onChange(deliverables.filter((d) => d.id !== id));
  };

  const addDeliverable = () => {
    if (deliverables.length >= maxDeliverables) return;
    onChange([
      ...deliverables,
      { id: crypto.randomUUID(), ...DEFAULT_DELIVERABLE },
    ]);
  };

  const filteredContentTypes = allowedContentTypes
    ? CONTENT_TYPE_OPTIONS.filter(opt => allowedContentTypes.includes(opt.value))
    : CONTENT_TYPE_OPTIONS;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold text-gray-900">Deliverables</h3>
        <span className="inline-flex items-center rounded-full bg-dc-teal/10 px-2.5 py-0.5 text-xs font-medium text-dc-teal">
          {deliverables.length} {deliverables.length === 1 ? 'piece' : 'pieces'} of content
        </span>
      </div>

      {/* Deliverable cards */}
      <div className="space-y-3">
        {deliverables.map((deliverable, index) => (
          <AppCard key={deliverable.id} className="p-0">
            <CardContent className="p-4 space-y-4">
              {/* Card header row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">
                  #{index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                  onClick={() => removeDeliverable(deliverable.id)}
                  disabled={deliverables.length <= 1}
                  aria-label="Remove deliverable"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Content type + Platform selects */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">Content Type</label>
                  <Select
                    value={deliverable.content_type}
                    onValueChange={(value: Deliverable['content_type']) =>
                      updateDeliverable(deliverable.id, {
                        content_type: value,
                        // Clear max duration if switching away from video type
                        max_duration_seconds: isVideoType(value)
                          ? deliverable.max_duration_seconds
                          : undefined,
                      })
                    }
                  >
                    <SelectTrigger className="rounded-full text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredContentTypes.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">Platform</label>
                  <Select
                    value={deliverable.platform}
                    onValueChange={(value: Deliverable['platform']) =>
                      updateDeliverable(deliverable.id, { platform: value })
                    }
                  >
                    <SelectTrigger className="rounded-full text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Aspect ratio pills */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Aspect Ratio</label>
                <div className="flex gap-2 flex-wrap">
                  {ASPECT_RATIO_OPTIONS.map((ratio) => (
                    <AppChip
                      key={ratio}
                      active={deliverable.aspect_ratio === ratio}
                      onClick={() =>
                        updateDeliverable(deliverable.id, { aspect_ratio: ratio })
                      }
                      className="px-3 py-1 text-xs"
                    >
                      {ratio}
                    </AppChip>
                  ))}
                </div>
              </div>

              {/* Max duration — only for video types */}
              {isVideoType(deliverable.content_type) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    Max Duration (seconds)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 60"
                    className="rounded-full h-9 text-sm"
                    value={deliverable.max_duration_seconds ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateDeliverable(deliverable.id, {
                        max_duration_seconds: val === '' ? undefined : Number(val),
                      });
                    }}
                  />
                </div>
              )}

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <Textarea
                  placeholder="Specific instructions for this piece…"
                  className="rounded-xl text-sm resize-none min-h-[72px]"
                  value={deliverable.description ?? ''}
                  onChange={(e) =>
                    updateDeliverable(deliverable.id, {
                      description: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </CardContent>
          </AppCard>
        ))}
      </div>

      {/* Add deliverable button */}
      <Button
        type="button"
        variant="outline"
        className="w-full rounded-full border-dashed border-dc-teal/20 text-gray-600 hover:border-dc-teal hover:text-dc-teal hover:bg-dc-teal/5 gap-2"
        onClick={addDeliverable}
        disabled={deliverables.length >= maxDeliverables}
      >
        <Plus className="h-4 w-4" />
        {deliverables.length >= maxDeliverables
          ? 'Maximum deliverables reached'
          : '+ Add Deliverable'}
      </Button>
    </div>
  );
}
