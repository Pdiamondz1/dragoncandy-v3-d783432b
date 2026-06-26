/** Shared layout primitives for /internal (AIOS) pages — ops-deck dark theme.
 *
 * These standardize the page-title block and content width that every internal
 * page was hand-rolling, so the surface reads as one consistent dashboard
 * instead of a dozen slightly-different pages.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WIDTHS = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  full: 'max-w-none',
} as const;

export type PageWidth = keyof typeof WIDTHS;

/** Consistent centered content column for a page. */
export function PageContainer({
  size = 'xl',
  className,
  children,
}: {
  size?: PageWidth;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('mx-auto w-full', WIDTHS[size], className)}>{children}</div>;
}

/** Standard page-title block: title, optional subtitle, optional right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-white lg:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
