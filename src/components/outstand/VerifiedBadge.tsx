import React from 'react';
import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ size = 'sm', className = '' }) => {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-dc-teal ${className}`}
      title="Verified Creator — social accounts connected via DragonCandy"
    >
      <BadgeCheck className={`${iconSize} fill-dc-teal text-white`} />
    </span>
  );
};
