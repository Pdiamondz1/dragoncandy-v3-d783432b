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

export const FollowerChart: React.FC<FollowerChartProps> = ({ platforms }) => {
  if (platforms.length === 0) return null;

  const data = platforms.map((p) => ({
    name: PLATFORM_LABELS[p.platform] ?? p.platform,
    followers: p.followers,
    platform: p.platform,
    delta: p.followersDelta,
  }));

  return (
    <div className="hidden md:block">
      <div className="text-sm font-bold text-gray-900 mb-3">Follower Growth</div>
      <div className="border border-gray-100 rounded-xl p-4">
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
        <div className="mt-3 space-y-1.5 border-t border-gray-50 pt-3">
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
