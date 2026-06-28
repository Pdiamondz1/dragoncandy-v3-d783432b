import React from 'react';
import { getDragonTier } from '@/lib/dragonTiers';

interface DragonTierBadgeProps {
  tier: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

export const DragonTierBadge: React.FC<DragonTierBadgeProps> = ({ tier, size = 'sm', className = '' }) => {
  const meta = getDragonTier(tier);
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${meta.colorClasses} ${sizeClasses} ${className}`}
      title={`${meta.label} — Dragon Rewards tier`}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
};
