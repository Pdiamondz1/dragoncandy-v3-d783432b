import { Skeleton } from '@/components/ui/skeleton';
import { useCreatorBriefPerformance, type CreatorBriefPerformanceRow } from '@/hooks/useCreatorBriefPerformance';
import { useResolveDragonShareOrgs } from '@/hooks/useResolveDragonShareOrgs';
import { deriveBriefStatus } from '@/lib/briefStatus';

function relativeTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusPill(row: CreatorBriefPerformanceRow): { text: string; className: string } {
  switch (deriveBriefStatus(row)) {
    case 'has_performance':
      return { text: `${Math.round(row.total_views ?? 0)} views`, className: 'bg-emerald-100 text-emerald-700' };
    case 'measuring':
      return { text: 'Measuring…', className: 'bg-amber-100 text-amber-800' };
    case 'unmeasured':
      return { text: 'Metrics unavailable', className: 'bg-dc-pink/30 text-dc-pink-accent' };
    case 'awaiting_post':
    default:
      return { text: 'Not posted yet', className: 'bg-dc-teal/15 text-dc-teal-btn' };
  }
}

/** Frameless feed — embedded in a dashboard section that provides its own chrome. */
export function BriefPerformanceCard() {
  const { data: briefs, isLoading } = useCreatorBriefPerformance();
  const orgIds = (briefs ?? []).map((b) => b.organization_id);
  const { data: orgs } = useResolveDragonShareOrgs(orgIds);
  const nameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div>
      <div>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : !briefs || briefs.length === 0 ? (
          <div className="text-center py-8 text-dc-text-muted">
            <p className="text-sm font-medium">No content briefs yet</p>
            <p className="text-xs mt-1">Generate a content brief above to see it here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {briefs.map((row) => {
              const pill = statusPill(row);
              const time = relativeTime(row.created_at);
              const restaurant = nameById.get(row.organization_id);
              const format = typeof row.brief?.recommended_format === 'string' ? row.brief.recommended_format : null;
              const platform = typeof row.brief?.platform === 'string' ? row.brief.platform : null;
              return (
                <div key={row.brief_id} className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl">
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${pill.className}`}>
                    {pill.text}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-dc-text">
                    {restaurant ?? 'Restaurant'}
                    {(format || platform) && (
                      <span className="ml-2 text-xs text-dc-text-muted capitalize">
                        {[format, platform].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {time && (
                    <span className="flex-shrink-0 text-xs text-dc-text-muted whitespace-nowrap">{time}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
