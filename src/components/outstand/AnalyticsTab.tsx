import React, { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Post, SocialAccount } from '@outstand-so/ui';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { useAccountMetrics, type AccountMetrics } from '@/hooks/outstand/useAccountMetrics';
import { KpiCards } from './analytics/KpiCards';
import { PlatformBreakdown } from './analytics/PlatformBreakdown';
import { TopPosts } from './analytics/TopPosts';
import { PostingHeatmap } from './analytics/PostingHeatmap';
import { FollowerChart } from './analytics/FollowerChart';
import { DonnyPerformanceInsights } from './DonnyPerformanceInsights';

type TimeRange = '7d' | '30d' | '90d';

const PLATFORM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'instagram', label: 'IG' },
  { key: 'tiktok', label: 'TT' },
  { key: 'facebook', label: 'FB' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YT' },
] as const;

interface AnalyticsTabProps {
  accounts: SocialAccount[];
  posts: Post[];
  accountsLoading: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ accounts, posts, accountsLoading }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const filteredAccounts = useMemo(() => {
    if (platformFilter === 'all') return accounts;
    return accounts.filter((a) => a.network === platformFilter);
  }, [accounts, platformFilter]);

  const filteredPosts = useMemo(() => {
    if (platformFilter === 'all') return posts;
    return posts.filter((p) =>
      (p.socialAccounts ?? []).some((sa) => sa.network === platformFilter),
    );
  }, [posts, platformFilter]);

  const { data: metrics, isLoading: metricsLoading } = useAccountMetrics(filteredAccounts, timeRange);

  const isLoading = accountsLoading || metricsLoading;

  if (isLoading) {
    return <DCSkeleton variant="card" count={4} className="mb-3" />;
  }

  if (!accounts.length) {
    return (
      <DCEmptyState
        icon={TrendingUp}
        title="No accounts connected"
        subtitle="Connect your social accounts to see analytics."
      />
    );
  }

  const safeMetrics: AccountMetrics = metrics ?? {
    totalFollowers: 0,
    engagementRate: 0,
    totalReach: 0,
    postsPublished: 0,
    followersDelta: null,
    engagementDelta: null,
    reachDelta: null,
    postsDelta: null,
    platformBreakdown: [],
  };

  const ranges: TimeRange[] = ['7d', '30d', '90d'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={timeRange === r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                timeRange === r ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {PLATFORM_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setPlatformFilter(f.key)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                platformFilter === f.key ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <KpiCards metrics={safeMetrics} />

      <div className="hidden md:grid md:grid-cols-2 gap-4">
        <PostingHeatmap posts={filteredPosts} />
        <TopPosts posts={filteredPosts} />
      </div>

      <div className="md:hidden">
        <TopPosts posts={filteredPosts} />
      </div>

      <FollowerChart platforms={safeMetrics.platformBreakdown} />

      <PlatformBreakdown platforms={safeMetrics.platformBreakdown} />

      <DonnyPerformanceInsights />
    </div>
  );
};
