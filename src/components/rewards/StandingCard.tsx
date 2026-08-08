import { AppCard } from '@/components/app/AppCard';
import { DragonTierBadge } from '@/components/badges/DragonTierBadge';
import { getDragonTier } from '@/lib/dragonTiers';
import { computeTierGap } from '@/lib/dragonTierGap';
import { useDcStanding, useDcCatalog } from '@/hooks/useDcPoints';
import { useDragonPoints } from '@/hooks/useDragonPoints';

/** Block 1 — balance, tier, and exactly what the next tier still needs. */
export function StandingCard() {
  const { data: standing, isLoading, isError } = useDcStanding();
  const { data: catalog } = useDcCatalog();
  // Degrade path: dragon_point_balances is own-row readable without the RPC, so a
  // failed dre_my_standing() costs the gap line, not the whole card.
  const { data: fallback } = useDragonPoints();

  if (isLoading) {
    return <AppCard><div className="h-24 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError || !standing) {
    return (
      <AppCard pad="6">
        <p className="text-xs font-medium text-dc-pink-accent">Your DC Points</p>
        <p className="mt-1 text-4xl font-bold text-dc-text">
          {(fallback?.balance ?? 0).toLocaleString()}
        </p>
        <div className="mt-2"><DragonTierBadge tier={fallback?.tier ?? 'egg'} /></div>
        <p className="mt-4 text-sm text-dc-text-muted">
          Progress toward your next standing is unavailable right now.
        </p>
      </AppCard>
    );
  }

  // catalog resolves on its own query and frequently has not settled yet when
  // standing already has (or, on a catalog error, never settles). Until we
  // actually have it, the gap is UNKNOWN — that is a different state from "there
  // is no next tier", and must never be collapsed into the latter.
  const gap = catalog
    ? computeTierGap(standing.role, standing, catalog.thresholds)
    : null;
  const nextLabel = gap?.nextTierKey ? getDragonTier(gap.nextTierKey).label : null;

  const needs: string[] = [];
  if (gap && gap.pointsShort > 0) needs.push(`${gap.pointsShort.toLocaleString()} more DC Points`);
  if (gap && gap.campaignsShort > 0) needs.push(`${gap.campaignsShort} more completed campaigns`);
  if (gap && gap.ratingRequired != null) {
    needs.push(gap.hasNoRatings
      ? `an average rating of ${gap.ratingRequired} (no reviews yet)`
      : `an average rating of ${gap.ratingRequired}`);
  }

  return (
    <AppCard pad="6">
      <p className="text-xs font-medium text-dc-pink-accent">Your DC Points</p>
      <p className="mt-1 text-4xl font-bold text-dc-text">{standing.balance.toLocaleString()}</p>
      <div className="mt-2"><DragonTierBadge tier={standing.tier} /></div>

      {!gap && (
        <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-dc-teal/[0.06]" />
      )}
      {gap && gap.nextTierKey === null && (
        <p className="mt-4 text-sm text-dc-text-muted">
          You are at the top of the ladder.
        </p>
      )}
      {gap && gap.nextTierKey !== null && needs.length > 0 && (
        <p className="mt-4 text-sm text-dc-text-muted">
          {nextLabel} needs {needs.join(' and ')}.
        </p>
      )}
      {gap && gap.nextTierKey !== null && needs.length === 0 && (
        <p className="mt-4 text-sm text-dc-text-muted">
          You have met everything {nextLabel} requires — it applies on the next update.
        </p>
      )}
    </AppCard>
  );
}
