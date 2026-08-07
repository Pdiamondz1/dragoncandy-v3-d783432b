import React, { useMemo } from 'react';
import type { Post } from '@outstand-so/ui';
import { getCaption, getUniqueNetworks } from '../postUtils';
import { isInPublishedFeed } from '@/lib/outstandUtils';
import { usePostPerformance } from '@/hooks/outstand/usePostPerformance';
import { formatCompactNumber } from '@/lib/utils';

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

/**
 * WHAT THIS USED TO DO, and why it changed.
 *
 * It was titled "Top Posts" and sorted by `publishedAt` DESCENDING — pure
 * recency — then displayed the date and a platform count. No metric was read,
 * fetched, or shown anywhere in the component. It was "Most Recent Posts"
 * wearing a "Top Posts" label, and a business reading it to decide what to make
 * more of was being told to repeat whatever it happened to publish last.
 *
 * Now: when measured engagement exists it ranks on that and shows the numbers.
 * When it does not, it still lists recent posts — that is genuinely useful — but
 * says "Recent Posts" and explains that engagement appears once measured. The
 * heading always matches the sort.
 */
export const TopPosts: React.FC<TopPostsProps> = ({ posts }) => {
  const { posts: measured, signal } = usePostPerformance();

  const byId = useMemo(
    () => new Map(measured.map((m) => [m.outstandPostId, m])),
    [measured],
  );

  const published = useMemo(() => posts.filter(isInPublishedFeed), [posts]);

  // Rank on real engagement only when there is enough of it to mean anything.
  // One measured post is a fact, not a ranking.
  const ranked = signal.hasSignal;

  const rows = useMemo(() => {
    const withMetrics = published
      .map((post) => ({ post, metrics: byId.get(post.id) ?? null }))
      .filter((r) => (ranked ? r.metrics !== null : true));

    withMetrics.sort((a, b) => {
      if (ranked && a.metrics && b.metrics) {
        return b.metrics.interactions - a.metrics.interactions || b.metrics.views - a.metrics.views;
      }
      return (
        new Date(b.post.publishedAt ?? b.post.createdAt ?? 0).getTime() -
        new Date(a.post.publishedAt ?? a.post.createdAt ?? 0).getTime()
      );
    });

    return withMetrics.slice(0, 5).map(({ post, metrics }) => ({
      post,
      metrics,
      caption: getCaption(post),
      networks: getUniqueNetworks(post),
      publishedCount: (post.socialAccounts ?? []).filter((sa) => sa.status === 'published').length,
    }));
  }, [published, byId, ranked]);

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-gray-900">
          {ranked ? 'Top Posts' : 'Recent Posts'}
        </div>
        {/* N is always stated. A ranking whose sample size is invisible is a
            claim the reader cannot weigh. */}
        <div className="text-[10px] text-dc-text-muted">
          {ranked ? `by engagement · ${signal.n} measured` : 'most recent'}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(({ post, metrics, caption, networks, publishedCount }, i) => (
          <div key={post.id} className="flex items-center gap-2.5 py-1.5 border-b border-dc-teal/10 last:border-0">
            <div className="text-sm font-extrabold text-dc-teal w-4">{i + 1}</div>
            <div className="w-9 h-9 bg-dc-teal/[0.04] rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-gray-900 truncate">{caption || 'Untitled'}</div>
              <div className="text-[10px] text-gray-400">
                {metrics ? (
                  <>
                    {formatCompactNumber(metrics.interactions)} interaction
                    {metrics.interactions !== 1 ? 's' : ''}
                    {' · '}
                    {formatCompactNumber(metrics.views)} views
                  </>
                ) : (
                  <>
                    {new Date(post.publishedAt ?? post.createdAt ?? 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' · '}
                    {publishedCount} platform{publishedCount !== 1 ? 's' : ''}
                  </>
                )}
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

      {!ranked && (
        <p className="text-[10px] text-dc-text-muted mt-2">
          Engagement ranking needs {signal.needed} more measured post
          {signal.needed !== 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
};
