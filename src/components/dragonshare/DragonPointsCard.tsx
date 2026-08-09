import { Gem, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDragonPoints, useDragonRewardsEnabled } from '@/hooks/useDragonPoints';
import { DragonTierBadge } from '@/components/badges/DragonTierBadge';

export function DragonPointsCard() {
  // Launch gate: the Dragon Rewards display stays hidden until the founder enables the
  // DRAGON_REWARDS_ENABLED flag (fail-safe-off). Points keep accruing in the ledger regardless.
  const enabled = useDragonRewardsEnabled();
  const { data, isLoading } = useDragonPoints();
  if (!enabled) return null;
  // This card sits on the business AND creator dashboards, and used to be an inert div —
  // a balance with nowhere to click, the same dead end as the "+200 DC Points" bell that
  // /rewards was built to answer. It is a Link so the number is the way in.
  return (
    <Link
      to="/rewards"
      aria-label="View your DC Points"
      className="block rounded-2xl border border-dc-pink/40 bg-dc-pink/10 p-4 transition-colors hover:bg-dc-pink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink-accent"
    >
      <div className="mb-1 flex items-center gap-2">
        <Gem className="h-4 w-4 text-dc-pink-accent" />
        <span className="text-xs font-medium text-dc-pink-accent">DC Points</span>
        <ChevronRight className="ml-auto h-4 w-4 text-dc-pink-accent" aria-hidden="true" />
      </div>
      <p className="text-xl font-bold">{isLoading ? '—' : (data?.balance ?? 0).toLocaleString()}</p>
      <div className="mt-1"><DragonTierBadge tier={data?.tier ?? 'egg'} /></div>
    </Link>
  );
}
