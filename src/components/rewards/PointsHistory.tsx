import { AppCard } from '@/components/app/AppCard';
import { getDragonEvent } from '@/lib/dragonEvents';
import { useDcLedger } from '@/hooks/useDcPoints';

/** Block 2 — the caller's own award history, human-labeled. */
export function PointsHistory() {
  const { data: entries, isLoading, isError } = useDcLedger();

  if (isLoading) {
    return <AppCard><div className="h-32 animate-pulse rounded-xl bg-dc-teal/[0.06]" /></AppCard>;
  }
  if (isError) {
    return <AppCard><p className="text-sm text-dc-text-muted">Your history is unavailable right now.</p></AppCard>;
  }
  if (!entries || entries.length === 0) {
    return (
      <AppCard pad="6">
        <h2 className="text-base font-bold text-dc-text">Your history</h2>
        <p className="mt-2 text-sm text-dc-text-muted">
          You have not earned any DC Points yet. The list below shows every way to earn them.
        </p>
      </AppCard>
    );
  }

  return (
    <AppCard pad="6">
      <h2 className="text-base font-bold text-dc-text">Your history</h2>
      <ul className="mt-3 divide-y divide-dc-teal/10">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-sm text-dc-text">{getDragonEvent(e.eventType).label}</span>
            <span className="flex items-baseline gap-3 flex-shrink-0">
              <span className="text-sm font-bold text-dc-pink-accent">
                +{e.points.toLocaleString()}
              </span>
              <span className="text-xs text-dc-text-muted whitespace-nowrap">
                {new Date(e.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </AppCard>
  );
}
