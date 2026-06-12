import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Eye, X } from 'lucide-react';
import { usePendingActions, type PendingAction } from '@/hooks/usePendingActions';
import { formatRelativeTime } from '@/lib/campaignUtils';

function isDismissed(campaignId: string): boolean {
  try {
    const key = `pendingBannerDismissed_${campaignId}`;
    const val = localStorage.getItem(key);
    if (!val) return false;
    const dismissedAt = new Date(val).getTime();
    return Date.now() - dismissedAt < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismiss(campaignId: string) {
  try {
    localStorage.setItem(`pendingBannerDismissed_${campaignId}`, new Date().toISOString());
  } catch { /* localStorage unavailable */ }
}

type BannerVariant = 'banner' | 'row';

function ActionBanner({ action, onDismiss, variant = 'banner' }: { action: PendingAction; onDismiss: () => void; variant?: BannerVariant }) {
  const navigate = useNavigate();
  const icon = action.actionType === 'review_application'
    ? <Clock className="h-4 w-4 text-amber-600 shrink-0" />
    : <Eye className="h-4 w-4 text-pink-600 shrink-0" />;

  const timeAgo = formatRelativeTime(action.occurredAt);
  const message = action.actionType === 'review_application'
    ? `${action.creatorName} applied to "${action.campaignTitle}" ${timeAgo}`
    : `${action.creatorName} submitted content for "${action.campaignTitle}" ${timeAgo}`;

  const ctaLabel = action.actionType === 'review_application' ? 'Review Application →' : 'Review Content →';

  if (variant === 'row') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 border-l-2 border-l-amber-400">
        {icon}
        <p className="text-sm text-dc-text flex-1 min-w-0">
          {message} —{' '}
          <button
            onClick={() => navigate(`/dashboard/business/campaigns/${action.campaignId}`)}
            className="font-semibold text-dc-teal-btn hover:underline"
          >
            {ctaLabel}
          </button>
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="text-dc-text-muted hover:text-dc-text shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3">
      {icon}
      <p className="text-sm text-gray-800 flex-1 min-w-0">
        {message} —{' '}
        <button
          onClick={() => navigate(`/dashboard/business/campaigns/${action.campaignId}`)}
          className="font-semibold text-amber-700 hover:underline"
        >
          {ctaLabel}
        </button>
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="text-gray-400 hover:text-gray-600 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PendingActionBanners({ variant = 'banner' }: { variant?: BannerVariant } = {}) {
  const { data: actions, isLoading, isError } = usePendingActions();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  if (isLoading || isError || !actions?.length) return null;

  const visible = actions.filter(a => !isDismissed(a.campaignId) && !dismissed.has(a.campaignId));
  if (visible.length === 0) return null;

  const shown = visible.slice(0, 3);
  const remaining = visible.length - 3;

  const handleDismiss = (campaignId: string) => {
    dismiss(campaignId);
    setDismissed(prev => new Set(prev).add(campaignId));
  };

  return (
    <div className={variant === 'row' ? 'divide-y divide-dc-teal/10' : 'space-y-2'}>
      {shown.map(action => (
        <ActionBanner
          key={`${action.actionType}-${action.campaignId}`}
          action={action}
          variant={variant}
          onDismiss={() => handleDismiss(action.campaignId)}
        />
      ))}
      {remaining > 0 && (
        <p className={`text-xs text-amber-600 font-medium ${variant === 'row' ? 'px-4 py-2' : 'pl-1'}`}>
          + {remaining} more campaign{remaining !== 1 ? 's' : ''} need attention
        </p>
      )}
    </div>
  );
}
