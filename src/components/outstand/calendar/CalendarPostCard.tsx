import React from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isScheduled } from '@/pages/OutstandManager';

const NETWORK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', text: 'text-white', label: 'IG' },
  tiktok: { bg: 'bg-black', text: 'text-white', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', text: 'text-white', label: 'FB' },
  x: { bg: 'bg-gray-800', text: 'text-white', label: 'X' },
  youtube: { bg: 'bg-red-600', text: 'text-white', label: 'YT' },
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getStatusBorder(post: Post): string {
  if (isScheduled(post)) return 'border-l-dc-teal';
  const sas = post.socialAccounts ?? [];
  if (sas.some((sa) => sa.status === 'failed')) return 'border-l-red-400';
  return 'border-l-amber-400';
}

interface CalendarPostCardProps {
  post: Post;
  onReschedule?: (post: Post) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, post: Post) => void;
}

export const CalendarPostCard: React.FC<CalendarPostCardProps> = ({
  post,
  onReschedule,
  draggable = false,
  onDragStart,
}) => {
  const caption = getCaption(post);
  const networks = getUniqueNetworks(post);
  const time = formatTime(post.scheduledAt ?? post.publishedAt);
  const borderColor = getStatusBorder(post);

  return (
    <div
      className={`border-l-3 ${borderColor} rounded bg-white/80 p-1.5 mb-1.5 cursor-pointer hover:bg-white transition-colors ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => onDragStart(e, post) : undefined}
      onClick={() => onReschedule?.(post)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onReschedule?.(post)}
    >
      {time && (
        <div className="text-[9px] font-semibold text-dc-teal">{time}</div>
      )}
      <div className="text-[10px] text-gray-900 font-medium mt-0.5 line-clamp-2">
        {caption || <span className="italic text-gray-400">No caption</span>}
      </div>
      {networks.length > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {networks.map((n) => {
            const color = NETWORK_COLORS[n] ?? { bg: 'bg-gray-400', text: 'text-white', label: n };
            return (
              <span
                key={n}
                className={`text-[8px] ${color.bg} ${color.text} px-1 py-px rounded font-semibold`}
              >
                {color.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
