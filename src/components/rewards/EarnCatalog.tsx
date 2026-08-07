import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { getDragonEvent } from '@/lib/dragonEvents';
import { useDcCatalog, useDcLedger, useDcStanding } from '@/hooks/useDcPoints';

/** Block 3 — the live earn catalog, rendered from dre_config so retuning needs no deploy. */
export function EarnCatalog() {
  const { data: catalog, isLoading, isError } = useDcCatalog();
  const { data: standing } = useDcStanding();
  const { data: entries } = useDcLedger();

  if (isLoading) {
    return <AppCard><div className="h-40 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError || !catalog) return null;

  const prefix = standing?.role === 'content_creator' ? 'creator.' : 'business.';
  const earnedKeys = new Set((entries ?? []).map((e) => e.eventType));

  const rows = Object.entries(catalog.pointValues)
    .filter(([key]) => key.startsWith(prefix))
    .sort((a, b) => b[1] - a[1]);

  return (
    <AppCard pad="6">
      <h2 className="text-base font-bold text-dc-text">How to earn</h2>
      <ul className="mt-3 divide-y divide-dc-teal/10">
        {rows.map(([key, points]) => {
          const meta = getDragonEvent(key);
          const earned = !meta.repeatable && earnedKeys.has(key);
          return (
            <li key={key} className="flex items-center justify-between gap-4 py-2.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-dc-text truncate">{meta.label}</span>
                {earned && <AppStatusBadge tone="teal">Earned</AppStatusBadge>}
                {meta.repeatable && <AppStatusBadge tone="neutral">Every time</AppStatusBadge>}
              </span>
              <span className="text-sm font-bold text-dc-pink-accent flex-shrink-0">
                +{points.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </AppCard>
  );
}
