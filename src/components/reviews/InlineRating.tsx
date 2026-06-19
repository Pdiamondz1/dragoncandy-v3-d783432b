import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineRatingProps {
  averageRating?: number | null;
  totalReviews?: number | null;
  size?: 'sm' | 'md';
  className?: string;
  /** When provided and there are reviews, the rating renders as a button (e.g. to scroll to the reviews section). */
  onClick?: () => void;
}

export const InlineRating: React.FC<InlineRatingProps> = ({
  averageRating,
  totalReviews,
  size = 'sm',
  className,
  onClick,
}) => {
  const total = totalReviews ?? 0;

  if (total === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full bg-dc-teal/15 text-dc-teal-btn font-semibold px-2 py-0.5 text-xs',
          className,
        )}
      >
        New
      </span>
    );
  }

  const starSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const inner = (
    <>
      <Star className={cn(starSize, 'fill-dc-pink-accent text-dc-pink-accent')} />
      <span className="font-semibold text-dc-pink-accent">{(averageRating ?? 0).toFixed(1)}</span>
      <span className="text-dc-text-muted">· {total} review{total !== 1 ? 's' : ''}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${total} review${total !== 1 ? 's' : ''}`}
        className={cn(
          'inline-flex items-center gap-1 text-xs rounded cursor-pointer hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink-accent/40',
          className,
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      {inner}
    </span>
  );
};
