import React from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { VideoFrameThumbnail } from '@/components/content/VideoFrameThumbnail';
import type { MediaItem } from './MediaPreviewGrid';

export interface DeliverableSlot {
  mediaUrl: string;
  mediaItem: MediaItem;
  scheduledAt: string;
  caption?: string;
  hashtags?: string[];
}

interface DeliverableScheduleReviewProps {
  slots: DeliverableSlot[];
  onSlotsChange: (slots: DeliverableSlot[]) => void;
  sameDay: boolean;
  onSameDayChange: (sameDay: boolean) => void;
  onScheduleAll: () => void;
  isScheduling: boolean;
}

function isVideoItem(item: MediaItem): boolean {
  if (item.mimeType?.startsWith('video/')) return true;
  const ext = item.url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
}

function getFilename(item: MediaItem): string {
  if (item.filename) return item.filename;
  const name = item.url.split('/').pop()?.split('?')[0] ?? 'file';
  return decodeURIComponent(name);
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (d.toDateString() === now.toDateString()) return `Today at ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${timeStr}`;
  return `${dateStr} at ${timeStr}`;
}

export const DeliverableScheduleReview: React.FC<DeliverableScheduleReviewProps> = ({
  slots,
  onSlotsChange,
  sameDay,
  onSameDayChange,
  onScheduleAll,
  isScheduling,
}) => {
  const handleTimeChange = (index: number, newTime: string) => {
    const updated = slots.map((slot, i) =>
      i === index ? { ...slot, scheduledAt: new Date(newTime).toISOString() } : slot,
    );
    onSlotsChange(updated);
  };

  const handleSameDayToggle = (checked: boolean) => {
    onSameDayChange(checked);
    if (checked && slots.length > 1) {
      const baseDate = new Date(slots[0].scheduledAt);
      const updated = slots.map((slot, i) => {
        const d = new Date(baseDate);
        d.setHours(baseDate.getHours() + i * 2, baseDate.getMinutes(), 0, 0);
        return { ...slot, scheduledAt: d.toISOString() };
      });
      onSlotsChange(updated);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-teal-50/50 rounded-xl p-3">
        <p className="text-[10px] font-semibold uppercase text-dc-teal tracking-wide mb-2">
          Schedule Deliverables
        </p>
        <p className="text-xs text-gray-500">
          Each deliverable will be posted separately. Adjust dates and times below.
        </p>
      </div>

      <label className="flex items-center gap-2 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={sameDay}
          onChange={(e) => handleSameDayToggle(e.target.checked)}
          className="rounded border-gray-300 text-dc-teal focus:ring-dc-teal"
        />
        <span className="text-xs text-gray-600">Schedule all on same day</span>
      </label>

      <div className="space-y-2.5">
        {slots.map((slot, index) => {
          const isVideo = isVideoItem(slot.mediaItem);
          const filename = getFilename(slot.mediaItem);

          return (
            <div key={index} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {isVideo ? (
                    <VideoFrameThumbnail
                      fileId={slot.mediaItem.fileId ?? ''}
                      videoUrl={slot.mediaUrl}
                      storedThumbnailUrl={slot.mediaItem.storedThumbnailUrl ?? null}
                      mimeType={slot.mediaItem.mimeType ?? 'video/mp4'}
                      filename={filename}
                    />
                  ) : (
                    <img src={slot.mediaUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    Deliverable {index + 1}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{filename}</p>
                  <p className="text-[11px] text-dc-teal font-medium mt-1">
                    {formatSlotTime(slot.scheduledAt)}
                  </p>
                </div>
              </div>

              {/* Date/time picker */}
              <div className="flex items-center gap-2 mt-2.5">
                <CalendarDays className="h-3.5 w-3.5 text-dc-teal flex-shrink-0" />
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(slot.scheduledAt)}
                  onChange={(e) => handleTimeChange(index, e.target.value)}
                  className="text-[11px] text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-dc-teal"
                />
              </div>

              {/* Caption preview (only when scheduled separately) */}
              {!sameDay && slot.caption && (
                <p className="text-[10px] text-gray-500 mt-1.5 line-clamp-2 italic">
                  {slot.caption}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onScheduleAll}
        disabled={isScheduling || slots.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-dc-teal text-white text-sm font-bold py-3.5 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
      >
        {isScheduling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Scheduling...
          </>
        ) : (
          <>
            <CalendarDays className="h-4 w-4" />
            Schedule All ({slots.length})
          </>
        )}
      </button>
    </div>
  );
};
