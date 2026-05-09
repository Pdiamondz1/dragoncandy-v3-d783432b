import React from 'react';
import type { AccountMetrics } from '@/hooks/outstand/useAccountMetrics';

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[11px] text-gray-300">—</span>;
  const isUp = delta >= 0;
  return (
    <span className={`text-[11px] font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
      <span className="text-gray-300 font-normal ml-1">vs prior</span>
    </span>
  );
}

interface KpiCardsProps {
  metrics: AccountMetrics;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  const cards = [
    { label: 'Total Followers', mobileLabel: 'Followers', value: formatNumber(metrics.totalFollowers), delta: metrics.followersDelta },
    { label: 'Engagement Rate', mobileLabel: 'Eng. Rate', value: `${metrics.engagementRate}%`, delta: metrics.engagementDelta },
    { label: 'Total Reach', mobileLabel: 'Reach', value: formatNumber(metrics.totalReach), delta: metrics.reachDelta },
    { label: 'Posts Published', mobileLabel: 'Published', value: metrics.postsPublished.toString(), delta: metrics.postsDelta },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="bg-teal-50/50 rounded-xl p-3 border border-teal-100">
          <div className="text-[9px] font-semibold uppercase text-gray-400 tracking-wide">
            <span className="hidden md:inline">{card.label}</span>
            <span className="md:hidden">{card.mobileLabel}</span>
          </div>
          <div className="text-2xl md:text-[26px] font-extrabold text-gray-900 mt-1">{card.value}</div>
          <div className="mt-1"><DeltaBadge delta={card.delta} /></div>
        </div>
      ))}
    </div>
  );
};
