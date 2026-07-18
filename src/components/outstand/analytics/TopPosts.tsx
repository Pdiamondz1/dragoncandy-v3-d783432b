import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isInPublishedFeed } from '@/lib/outstandUtils';

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
        .sort((a, b) =>
          new Date(b.publishedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.publishedAt ?? a.createdAt ?? 0).getTime(),
        )
        .slice(0, 5)
        .map((post) => ({
          post,
          caption: getCaption(post),
          networks: getUniqueNetworks(post),
          publishedCount: (post.socialAccounts ?? []).filter((sa) => sa.status === 'published').length,
        })),
    [posts],
  );

  if (topPosts.length === 0) return null;

  return (
    <div>
      <div className="text-sm font-bold text-gray-900 mb-3">Top Posts</div>
      <div className="space-y-2">
        {topPosts.map(({ post, caption, networks, publishedCount }, i) => (
          <div key={post.id} className="flex items-center gap-2.5 py-1.5 border-b border-dc-teal/10 last:border-0">
            <div className="text-sm font-extrabold text-dc-teal w-4">{i + 1}</div>
            <div className="w-9 h-9 bg-dc-teal/[0.04] rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-gray-900 truncate">{caption || 'Untitled'}</div>
              <div className="text-[10px] text-gray-400">
                {new Date(post.publishedAt ?? post.createdAt ?? 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' · '}
                {publishedCount} platform{publishedCount !== 1 ? 's' : ''}
              </div>
            </div>
            {networks[0] && (
              <span className={`text-[8px] ${NETWORK_COLORS[networks[0]]?.bg ?? 'bg-dc-teal-btn'} text-white px-1.5 py-0.5 rounded font-semibold`}>
                {NETWORK_COLORS[networks[0]]?.label ?? networks[0]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
