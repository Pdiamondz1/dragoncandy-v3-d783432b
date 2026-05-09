import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isInPublishedFeed } from '@/pages/OutstandManager';

const NETWORK_COLORS: Record<string, { bg: string; label: string }> = {
  instagram: { bg: 'bg-[#E1306C]', label: 'IG' },
  tiktok: { bg: 'bg-black', label: 'TT' },
  facebook: { bg: 'bg-[#1877F2]', label: 'FB' },
  x: { bg: 'bg-gray-800', label: 'X' },
  youtube: { bg: 'bg-red-600', label: 'YT' },
};

interface TopPostsProps {
  posts: Post[];
}

export const TopPosts: React.FC<TopPostsProps> = ({ posts }) => {
  const topPosts = useMemo(
    () =>
      posts
        .filter(isInPublishedFeed)
        .slice(0, 5)
        .map((post) => ({
          post,
          caption: getCaption(post),
          networks: getUniqueNetworks(post),
        })),
    [posts],
  );

  if (topPosts.length === 0) return null;

  return (
    <div>
      <div className="text-sm font-bold text-gray-900 mb-3">Top Posts</div>
      <div className="space-y-2">
        {topPosts.map(({ post, caption, networks }, i) => (
          <div key={post.id} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
            <div className="text-sm font-extrabold text-dc-teal w-4">{i + 1}</div>
            <div className="w-9 h-9 bg-gray-100 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-gray-900 truncate">{caption || 'Untitled'}</div>
              <div className="text-[10px] text-gray-400">Published</div>
            </div>
            {networks[0] && (
              <span className={`text-[8px] ${NETWORK_COLORS[networks[0]]?.bg ?? 'bg-gray-400'} text-white px-1.5 py-0.5 rounded font-semibold`}>
                {NETWORK_COLORS[networks[0]]?.label ?? networks[0]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
