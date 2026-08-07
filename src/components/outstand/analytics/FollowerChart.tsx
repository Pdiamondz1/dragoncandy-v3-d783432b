import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { PlatformMetrics } from '@/hooks/outstand/useAccountMetrics';
import { formatCompactNumber } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
  facebook: '#1877F2',
  x: '#6B7280',
  youtube: '#DC2626',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  x: 'X',
  youtube: 'YT',
};

interface FollowerChartProps {
  platforms: PlatformMetrics[];
}

/**
 * The bars plot CURRENT follower counts, so the heading says so.
 *
 * This was titled "Follower Growth" while `<Bar dataKey="followers">` rendered
 * absolute size, which made the tallest bar read as the fastest-growing
 * platform — usually the exact opposite of the truth, since the biggest account
 * is typically the slowest mover. Growth was present, but demoted to a small
 * delta badge under the chart where the bar heights drowned it.
 *
 * Rather than re-plot deltas (a bar chart of ±small numbers next to a 5-figure
 * base is its own kind of misleading), the title now matches the geometry and
 * the per-platform change is stated as an explicit "+N since last check" beside
 * each row.
 */
export const FollowerChart: React.FC<FollowerChartProps> = ({ platforms }) => {
  if (platforms.length === 0) return null;

  const data = platforms.map((p) => ({
    name: PLATFORM_LABELS[p.platform] ?? p.platform,
    followers: p.followers,
    platform: p.platform,
    delta: p.followersDelta,
  }));

  const anyMovement = data.some((d) => typeof d.delta === 'number' && d.delta !== 0);

  return (
    <div className="hidden md:block">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-gray-900">Followers by Platform</div>
        <div className="text-[10px] text-dc-text-muted">
          {anyMovement ? 'change since last check' : 'current totals'}
        </div>
      </div>
      <div className="border border-dc-teal/10 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="followers" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] ?? '#4DD9C0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 space-y-1.5 border-t border-dc-teal/10 pt-3">
          {data.map((entry) => (
            <div key={entry.platform} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[entry.platform] ?? '#4DD9C0' }} />
                <span className="font-medium text-gray-700">{entry.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{formatCompactNumber(entry.followers)}</span>
                <DeltaBadge delta={entry.delta} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
