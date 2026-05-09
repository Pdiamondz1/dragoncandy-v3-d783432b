import React from 'react';
import type { Comment } from '@/hooks/outstand/usePostComments';

const PLATFORM_COLORS: Record<string, { bg: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', label: 'IG' },
  tiktok: { bg: 'bg-black', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', label: 'FB' },
  x: { bg: 'bg-gray-800', label: 'X' },
  youtube: { bg: 'bg-red-600', label: 'YT' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface EngagementListProps {
  comments: Comment[];
  selectedId: string | null;
  ownAccountIds: string[];
  onSelect: (comment: Comment) => void;
}

export const EngagementList: React.FC<EngagementListProps> = ({
  comments,
  selectedId,
  ownAccountIds,
  onSelect,
}) => {
  return (
    <div className="divide-y divide-gray-50">
      {comments.map((comment) => {
        const isSelected = selectedId === comment.id;
        const isReplied = ownAccountIds.includes(comment.authorId) || comment.isReply;
        const platform = PLATFORM_COLORS[comment.platform] ?? { bg: 'bg-gray-400', label: '?' };

        return (
          <button
            key={comment.id}
            type="button"
            onClick={() => onSelect(comment)}
            className={`w-full text-left px-4 py-3 transition-colors ${
              isSelected ? 'bg-teal-50/50 border-l-[3px] border-l-dc-teal' : 'hover:bg-gray-50'
            } ${isReplied ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className={`w-8 h-8 ${platform.bg} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                  {platform.label}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-900 truncate">{comment.authorName}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{comment.text}</div>
                </div>
              </div>
              <span className="text-[9px] text-gray-300 whitespace-nowrap shrink-0">{timeAgo(comment.createdAt)}</span>
            </div>
            <div className="flex gap-1 mt-1.5 ml-[42px]">
              <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                {comment.isReply ? 'Reply' : 'Comment'}
              </span>
              {isReplied ? (
                <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Replied</span>
              ) : (
                <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Unreplied</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
