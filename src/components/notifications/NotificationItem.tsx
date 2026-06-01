import React from 'react';
import { Trash2 } from 'lucide-react';
import type { PushNotification, NotificationCategory } from '@/types/notifications';
import { CATEGORY_META } from '@/types/notifications';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: PushNotification;
  compact?: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}

const CATEGORY_BG: Record<string, string> = {
  campaigns: 'bg-dc-teal',
  messages: 'bg-dc-pink',
  transactions: 'bg-dc-teal-btn',
  content: 'bg-dc-pink-accent',
  account: 'bg-dc-dark',
  dragonshare: 'bg-dc-teal',
  promotions: 'bg-dc-pink',
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  compact = false,
  onClick,
  onDelete,
}) => {
  const isUnread = !notification.read_at;
  const category = notification.category as NotificationCategory | 'legacy';
  const iconBg = CATEGORY_BG[category] ?? 'bg-dc-teal';
  const emoji = category !== 'legacy' && CATEGORY_META[category as NotificationCategory]
    ? CATEGORY_META[category as NotificationCategory].icon
    : '🔔';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full flex items-start gap-3 text-left transition-colors hover:bg-dc-teal/[0.08] rounded-xl',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
        isUnread ? 'bg-dc-teal/[0.06]' : 'bg-transparent',
      )}
    >
      {/* Icon circle */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-full text-white',
          compact ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base',
          iconBg,
        )}
      >
        <span role="img" aria-hidden="true">{emoji}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'font-semibold text-dc-text truncate',
            compact ? 'text-sm' : 'text-base',
          )}>
            {notification.title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-dc-teal" />
            )}
            <span className="text-xs text-dc-text-muted whitespace-nowrap">
              {formatRelativeTime(notification.created_at)}
            </span>
            {onDelete && !compact && (
              <button
                type="button"
                aria-label="Delete notification"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.id);
                }}
                className="ml-1 text-dc-text-muted hover:text-red-500 transition-colors lg:opacity-0 lg:group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p className={cn(
          'text-dc-text-muted mt-0.5 line-clamp-2',
          compact ? 'text-xs' : 'text-sm',
        )}>
          {notification.body}
        </p>
      </div>
    </button>
  );
};
