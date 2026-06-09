import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineRatingProps {
  averageRating?: number | null;
  totalReviews?: number | null;
  size?: 'sm' | 'md';
  className?: string;
}

export const InlineRating: React.FC<InlineRatingProps> = ({
  averageRating,
  totalReviews,
  size = 'sm',
  className,
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
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      <Star className={cn(starSize, 'fill-dc-pink-accent text-dc-pink-accent')} />
      <span className="font-semibold text-dc-pink-accent">{(averageRating ?? 0).toFixed(1)}</span>
      <span className="text-dc-text-muted">· {total} review{total !== 1 ? 's' : ''}</span>
    </span>
  );
};
