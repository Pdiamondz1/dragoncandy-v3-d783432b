import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { PlatformMetrics } from '@/hooks/outstand/useAccountMetrics';

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
  }));

  return (
    <div className="hidden md:block">
      <div className="text-sm font-bold text-gray-900 mb-3">Followers by Platform</div>
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
      </div>
    </div>
  );
};
