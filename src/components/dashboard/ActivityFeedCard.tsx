import React from 'react';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  published: 'bg-emerald-100 text-emerald-700',
  'in progress': 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  reviewing: 'bg-amber-100 text-amber-800',
  completed: 'bg-gray-100 text-gray-600',
  draft: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
  rejected: 'bg-red-100 text-red-600',
};

interface ActivityFeedCardProps {
  title: string;
  subtitle: string;
  status: string;
  onClick?: () => void;
}

export function ActivityFeedCard({ title, subtitle, status, onClick }: ActivityFeedCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  const statusClass = statusStyles[status.toLowerCase()] ?? 'bg-gray-100 text-gray-600';

  return (
    <Wrapper
      onClick={onClick}
      className={`w-full border-2 border-dc-teal rounded-2xl p-4 bg-white text-left ${
        onClick ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-dc-dark truncate">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusClass}`}
        >
          {status}
        </span>
      </div>
    </Wrapper>
  );
}
