import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import type { DSActivityItem } from '@/lib/dragonshareActivity';

interface DragonShareActivityCardProps {
  role: 'creator' | 'business';
  items: DSActivityItem[];
  isLoading: boolean;
}

function formatRelativeTime(dateString: string): string {
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function itemLabel(item: DSActivityItem): string {
  if (item.contentType) return capitalize(item.contentType);
  if (item.kind === 'paid') return 'Boosted post';
  return 'DragonShare post';
}

function pillFor(item: DSActivityItem, role: 'creator' | 'business') {
  switch (item.kind) {
    case 'paid':
      return {
        text: `Paid +$${Math.floor((item.payoutCents ?? 0) / 100)}`,
        className: 'bg-emerald-100 text-emerald-700',
      };
    case 'not_selected':
      return { text: 'Not selected', className: 'bg-amber-100 text-amber-800' };
    case 'submitted':
    default:
      return {
        text: role === 'business' ? 'Awaiting boost' : 'Submitted',
        className: 'bg-dc-teal/15 text-dc-teal-btn',
      };
  }
}

export function DragonShareActivityCard({ role, items, isLoading }: DragonShareActivityCardProps) {
  const basePath =
    role === 'creator' ? '/dashboard/creator/dragonshare' : '/dashboard/business/dragonshare';

  const emptyHint =
    role === 'creator'
      ? 'Share a post about a brand you love to get started'
      : 'Creator posts about you will show up here';

  return (
    <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
          DragonShare Activity
        </p>
      </div>
      <div className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-dc-text-muted">
            <p className="text-sm font-medium">No DragonShare activity yet</p>
            <p className="text-xs mt-1">{emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const pill = pillFor(item, role);
              const time = formatRelativeTime(item.timestamp);
              return (
                <Link
                  key={`${item.kind}-${item.postId}`}
                  to={`${basePath}?highlight=${item.postId}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl transition-colors hover:bg-dc-teal/[0.06]"
                >
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${pill.className}`}
                  >
                    {pill.text}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-dc-text">
                    {itemLabel(item)}
                  </span>
                  {time && (
                    <span className="flex-shrink-0 text-xs text-dc-text-muted whitespace-nowrap">
                      {time}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
