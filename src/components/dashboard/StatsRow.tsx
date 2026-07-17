import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { type LucideIcon } from 'lucide-react';

export interface StatItem {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  href?: string;
}

interface StatsRowProps {
  stats: StatItem[];
  isLoading: boolean;
}

/**
 * Quiet inline stats — bold numbers with muted labels, divided on desktop,
 * a loose 2-column grid on mobile. No card walls, no borders.
 */
export function StatsRow({ stats, isLoading }: StatsRowProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:flex lg:gap-0 lg:divide-x lg:divide-white/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="lg:px-8 lg:first:pl-0">
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:flex lg:gap-0 lg:divide-x lg:divide-white/10">
      {stats.map((stat) => {
        const content = (
          <>
            <div className="text-2xl lg:text-3xl font-bold tabular-nums text-white">
              {stat.value}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {stat.icon && <stat.icon className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />}
              <p className="text-xs font-medium text-white/60">{stat.label}</p>
            </div>
            {stat.subtitle && (
              <p className="text-xs text-white/40 mt-0.5">{stat.subtitle}</p>
            )}
          </>
        );

        const itemClass = 'lg:px-8 lg:first:pl-0';

        return stat.href ? (
          <Link
            key={stat.label}
            to={stat.href}
            className={`${itemClass} block group`}
          >
            <span className="block transition-opacity group-hover:opacity-70">{content}</span>
          </Link>
        ) : (
          <div key={stat.label} className={itemClass}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
