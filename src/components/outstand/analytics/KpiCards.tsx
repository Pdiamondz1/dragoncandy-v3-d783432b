import React from 'react';
import type { AccountMetrics } from '@/hooks/outstand/useAccountMetrics';
import { formatCompactNumber } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';
import { AppCard } from '@/components/app/AppCard';

interface KpiCardsProps {
  metrics: AccountMetrics;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  const cards = [
    { label: 'Total Followers', mobileLabel: 'Followers', value: formatCompactNumber(metrics.totalFollowers), delta: metrics.followersDelta },
    { label: 'Engagement Rate', mobileLabel: 'Eng. Rate', value: `${metrics.engagementRate}%`, delta: metrics.engagementDelta },
    { label: 'Total Reach', mobileLabel: 'Reach', value: formatCompactNumber(metrics.totalReach), delta: metrics.reachDelta },
    { label: 'Posts Published', mobileLabel: 'Published', value: metrics.postsPublished.toString(), delta: metrics.postsDelta },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <AppCard key={card.label} variant="inset" className="p-3">
          <div className="text-[9px] font-semibold uppercase text-gray-400 tracking-wide">
            <span className="hidden md:inline">{card.label}</span>
            <span className="md:hidden">{card.mobileLabel}</span>
          </div>
          <div className="text-2xl md:text-[26px] font-extrabold text-gray-900 mt-1">{card.value}</div>
          <div className="mt-1"><DeltaBadge delta={card.delta} showLabel /></div>
        </AppCard>
      ))}
    </div>
  );
};
