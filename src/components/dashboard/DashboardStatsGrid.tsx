import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { type LucideIcon } from 'lucide-react';

export interface StatItem {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  href?: string;
}

interface DashboardStatsGridProps {
  stats: StatItem[];
  isLoading: boolean;
}

export function DashboardStatsGrid({ stats, isLoading }: DashboardStatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-9 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const cardContent = (
          <>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                {stat.label}
              </p>
              <stat.icon className="h-4 w-4 text-dc-teal" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-gray-900 tabular-nums">
              {stat.value}
            </div>
            {stat.subtitle && (
              <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
            )}
          </>
        );

        const baseClass = 'border-2 border-dc-teal rounded-2xl p-4 bg-white';

        return stat.href ? (
          <Link
            key={stat.label}
            to={stat.href}
            className={`${baseClass} block cursor-pointer hover:shadow-md transition-shadow`}
          >
            {cardContent}
          </Link>
        ) : (
          <div key={stat.label} className={baseClass}>
            {cardContent}
          </div>
        );
      })}
    </div>
  );
}
