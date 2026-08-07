import { Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { resolveProfileAssetUrl } from '@/hooks/useSignedUrl';
import type { MyCrew } from '@/hooks/useMyCrews';

interface MyCrewsListProps {
  crews: MyCrew[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * The creator's roster of joined crews. Purely presentational — same contract
 * as CrewActivityFeed, owning its own loading / empty / error states.
 *
 * Rows are intentionally not links: there is no creator-facing crew detail
 * route, and a crew's membership is private to each member.
 */
export function MyCrewsList({ crews, isLoading, isError }: MyCrewsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-dc-teal/20 bg-dc-card p-3"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink/10 p-4 text-center">
        <p className="text-sm font-semibold text-dc-text">Couldn't load your crews</p>
        <p className="mt-0.5 text-xs text-dc-text-muted">Please refresh and try again.</p>
      </div>
    );
  }

  if (crews.length === 0) return null;

  return (
    <ul className="space-y-2">
      {crews.map((crew) => {
        const logo = resolveProfileAssetUrl(crew.logo_url);
        return (
          <li
            key={crew.group_id}
            className="flex items-center gap-3 rounded-2xl border border-dc-teal/25 bg-dc-card p-3"
          >
            {logo ? (
              <img
                src={logo}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dc-teal/12 text-dc-teal"
                aria-hidden="true"
              >
                <Users className="h-[18px] w-[18px]" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-dc-text">{crew.name}</p>
              {crew.business_name && (
                <p className="truncate text-xs text-dc-text-muted">by {crew.business_name}</p>
              )}
            </div>
            <AppStatusBadge tone="teal" className="shrink-0">
              Crew-only
            </AppStatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
