import { Link } from 'react-router-dom';
import { Gem } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDragonPoints, useDragonRewardsEnabled } from '@/hooks/useDragonPoints';

/**
 * Always-visible DC Points balance + the entry point to /rewards. Mounted in the
 * DashboardLayout top bar and MobileTopNav, immediately left of the bell.
 * Reuses useDragonPoints, whose React Query cache the dashboard card already fills,
 * so this costs no extra request per page.
 */
export function DcPointsChip() {
  const enabled = useDragonRewardsEnabled();
  const { profile } = useAuth();
  const { data, isLoading } = useDragonPoints();

  // Launch gate, then: brand has no DRE triggers, so a brand chip would read a
  // permanent 0 — worse than showing nothing. Loading renders nothing so the
  // top bar does not jitter as the balance resolves.
  if (!enabled) return null;
  if (profile?.role === 'brand') return null;
  if (isLoading) return null;

  return (
    <Link
      to="/rewards"
      aria-label={`${(data?.balance ?? 0).toLocaleString()} DC Points`}
      className="flex items-center gap-1.5 rounded-full border border-dc-pink/40 bg-dc-pink/10 px-2.5 py-1 transition-colors hover:bg-dc-pink/20 flex-shrink-0"
    >
      <Gem className="h-3.5 w-3.5 text-dc-pink-accent" />
      <span className="text-xs font-bold text-dc-pink-accent">
        {(data?.balance ?? 0).toLocaleString()}
      </span>
    </Link>
  );
}
