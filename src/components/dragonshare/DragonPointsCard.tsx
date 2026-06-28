import { Gem } from 'lucide-react';
import { useDragonPoints, useDragonRewardsEnabled } from '@/hooks/useDragonPoints';
import { DragonTierBadge } from '@/components/badges/DragonTierBadge';

export function DragonPointsCard() {
  // Launch gate: the Dragon Rewards display stays hidden until the founder enables the
  // DRAGON_REWARDS_ENABLED flag (fail-safe-off). Points keep accruing in the ledger regardless.
  const enabled = useDragonRewardsEnabled();
  const { data, isLoading } = useDragonPoints();
  if (!enabled) return null;
  return (
    <div className="rounded-2xl border border-dc-pink/40 bg-dc-pink/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gem className="h-4 w-4 text-dc-pink-accent" />
        <span className="text-xs font-medium text-dc-pink-accent">Dragon Points</span>
      </div>
      <p className="text-xl font-bold">{isLoading ? '—' : (data?.balance ?? 0).toLocaleString()}</p>
      <div className="mt-1"><DragonTierBadge tier={data?.tier ?? 'egg'} /></div>
    </div>
  );
}
