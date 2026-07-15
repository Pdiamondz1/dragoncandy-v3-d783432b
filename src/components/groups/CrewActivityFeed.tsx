import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Megaphone,
  PartyPopper,
  RotateCcw,
  Upload,
  UserCheck,
  UserPlus,
  type LucideProps,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getRelativeTime } from '@/lib/campaignUtils';
import type { CrewActivityRow } from '@/hooks/useCrewActivity';

interface CrewActivityFeedProps {
  items: CrewActivityRow[];
  isLoading: boolean;
  isError: boolean;
  /** Tighter layout for the creator's cross-crew strip. Also suppresses the
   *  per-row campaign link (which points at a business-only route). */
  compact?: boolean;
}

interface EventPresentation {
  Icon: ComponentType<LucideProps>;
  tone: string;
}

const EVENT_PRESENTATION: Record<string, EventPresentation> = {
  campaign_posted: { Icon: Megaphone, tone: 'bg-dc-teal/12 text-dc-teal' },
  application_received: { Icon: UserPlus, tone: 'bg-dc-teal/12 text-dc-teal' },
  hired: { Icon: UserCheck, tone: 'bg-dc-teal/12 text-dc-teal' },
  content_submitted: { Icon: Upload, tone: 'bg-dc-teal/12 text-dc-teal' },
  content_approved: { Icon: CheckCircle2, tone: 'bg-dc-teal/12 text-dc-teal' },
  revision_requested: { Icon: RotateCcw, tone: 'bg-dc-pink/25 text-dc-pink-accent' },
  completed: { Icon: PartyPopper, tone: 'bg-dc-pink/25 text-dc-pink-accent' },
};

const FALLBACK_PRESENTATION: EventPresentation = {
  Icon: Activity,
  tone: 'bg-dc-teal/12 text-dc-teal',
};

function presentationFor(eventType: string): EventPresentation {
  return EVENT_PRESENTATION[eventType] ?? FALLBACK_PRESENTATION;
}

/** Build a one-line, human-readable summary from the event type + metadata. */
function crewActivitySummary(item: CrewActivityRow): string {
  const creator = item.metadata.creator_name ?? 'A creator';
  const title = item.metadata.campaign_title ?? 'a campaign';

  switch (item.event_type) {
    case 'campaign_posted':
      return `New campaign posted to the crew: "${title}"`;
    case 'application_received':
      return `${creator} applied to "${title}"`;
    case 'hired':
      return `${creator} was hired for "${title}"`;
    case 'content_submitted':
      return `${creator} submitted content for "${title}"`;
    case 'content_approved':
      return `Content approved for "${title}"`;
    case 'revision_requested':
      return `Revision requested for "${title}"`;
    case 'completed':
      return `"${title}" completed`;
    default:
      return `Update on "${title}"`;
  }
}

/**
 * Pure presentational crew-activity feed. RLS decides which rows the caller
 * receives; this component simply renders them. Handles loading / empty /
 * error states itself.
 */
export function CrewActivityFeed({ items, isLoading, isError, compact }: CrewActivityFeedProps) {
  if (isLoading) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-dc-teal/20 bg-dc-card p-3"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink/10 p-4 text-center">
        <p className="text-sm font-semibold text-dc-text">Couldn't load activity</p>
        <p className="mt-0.5 text-xs text-dc-text-muted">Please refresh and try again.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dc-teal/25 bg-dc-teal/5 p-6 text-center">
        <p className="text-sm text-dc-text-muted">No crew activity yet.</p>
      </div>
    );
  }

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {items.map((item) => {
        const { Icon, tone } = presentationFor(item.event_type);
        const summary = crewActivitySummary(item);
        // Business feed (non-compact) links rows to the campaign detail; the
        // creator strip (compact) stays link-free — that route is business-only.
        const linkTo = compact ? null : `/dashboard/business/campaigns/${item.campaign_id}`;

        const body = (
          <>
            <span
              className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${
                compact ? 'h-8 w-8' : 'h-9 w-9'
              }`}
              aria-hidden="true"
            >
              <Icon className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-dc-text ${
                  compact ? 'truncate text-xs font-medium' : 'text-sm font-medium'
                }`}
              >
                {summary}
              </p>
              <p className="mt-0.5 text-xs text-dc-text-muted">
                {getRelativeTime(item.created_at)}
              </p>
            </div>
          </>
        );

        const rowClass = `flex items-center gap-3 rounded-2xl border border-dc-teal/25 bg-dc-card ${
          compact ? 'p-2.5' : 'p-3'
        }`;

        return (
          <li key={item.id}>
            {linkTo ? (
              <Link
                to={linkTo}
                className={`${rowClass} transition-colors hover:border-dc-teal hover:bg-dc-teal/5`}
              >
                {body}
              </Link>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
