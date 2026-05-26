import React from 'react';
import { CATEGORY_META } from '@/types/notifications';
import { cn } from '@/lib/utils';

interface NotificationCategoryTabsProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  unreadCounts: Record<string, number>;
}

const TABS = [
  { key: 'all', label: 'All' },
  ...Object.entries(CATEGORY_META).map(([key, meta]) => ({
    key,
    label: meta.label,
  })),
];

export const NotificationCategoryTabs: React.FC<NotificationCategoryTabsProps> = ({
  activeCategory,
  onCategoryChange,
  unreadCounts,
}) => {
  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
      <div className="flex gap-2">
        {TABS.map(({ key, label }) => {
          const isActive = activeCategory === key;
          const count = key === 'all' ? totalUnread : (unreadCounts[key] ?? 0);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onCategoryChange(key)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-dc-teal text-white'
                  : 'bg-white/80 text-dc-text-muted hover:bg-dc-teal/[0.1]',
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center rounded-full text-xs font-bold min-w-[18px] h-[18px] px-1',
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-red-500 text-white',
                )}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
