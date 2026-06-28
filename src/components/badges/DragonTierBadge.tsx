import React from 'react';
import { getDragonTier } from '@/lib/dragonTiers';
import { useDragonRewardsEnabled } from '@/hooks/useDragonPoints';

interface DragonTierBadgeProps {
  tier: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

export const DragonTierBadge: React.FC<DragonTierBadgeProps> = ({ tier, size = 'sm', className = '' }) => {
  // Launch-gated: renders nothing until DRAGON_REWARDS_ENABLED is on (anon-safe via feature_flags'
  // public read). This makes the otherwise-presentational badge able to render null by design — it
  // covers the anon public-profile badges as well as the instance inside DragonPointsCard.
  const enabled = useDragonRewardsEnabled();
  const meta = getDragonTier(tier);
  if (!enabled) return null;
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
