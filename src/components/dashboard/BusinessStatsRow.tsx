// src/components/dashboard/BusinessStatsRow.tsx
import { useBusinessDashboardMetrics, type BusinessMetric } from '@/hooks/useBusinessDashboardMetrics';
import { Loader2 } from 'lucide-react';

function StatCard({ metric }: { metric: BusinessMetric }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm text-center">
      <div className="text-xl font-extrabold text-gray-900">{metric.value}</div>
      <div className="text-[10px] text-gray-500 mt-1 leading-tight">{metric.label}</div>
      {metric.trend && (
        <div
          className={`text-[10px] mt-1 ${
            metric.trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {metric.trend.direction === 'up' ? '↑' : '↓'} {metric.trend.value}
        </div>
      )}
      {metric.emptyNudge && !metric.trend && (
        <div className="text-[10px] text-gray-400 mt-1">{metric.emptyNudge}</div>
      )}
    </div>
  );
}

export function BusinessStatsRow() {
  const { data: metrics, isLoading, isError } = useBusinessDashboardMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !metrics) return null;

  const cards = [
    metrics.activeCampaigns,
    metrics.pendingContent,
    metrics.totalSpend,
    metrics.avgEngagement,
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {cards.map((metric) => (
        <StatCard key={metric.label} metric={metric} />
      ))}
    </div>
  );
}
