
import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileOptimizedStarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const MobileOptimizedStarRating: React.FC<MobileOptimizedStarRatingProps> = ({
  rating,
  onRatingChange,
  readonly = false,
  size = 'md',
  className = ''
}) => {
  const sizes = {
    sm: 'h-5 w-5',
    md: 'h-7 w-7 md:h-5 md:w-5',
    lg: 'h-8 w-8 md:h-6 md:w-6'
  };

  const handleStarClick = (starRating: number) => {
    if (!readonly && onRatingChange) {
      onRatingChange(starRating);
    }
  };

  return (
    <div className={cn('flex items-center gap-1 md:gap-1', className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={cn(
            sizes[size],
            'transition-all duration-200',
            star <= rating
              ? 'fill-dc-pink-accent text-dc-pink-accent'
              : 'text-dc-pink-accent/25',
            !readonly && 'cursor-pointer hover:text-dc-pink-accent/60 active:scale-95 touch-manipulation',
            readonly && 'cursor-default'
          )}
          onClick={() => handleStarClick(star)}
          onTouchStart={() => {}} // Improve touch responsiveness
        >
          <Star className="w-full h-full" />
        </button>
      ))}
    </div>
  );
};

