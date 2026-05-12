import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Eye, X } from 'lucide-react';
import { usePendingActions, type PendingAction } from '@/hooks/usePendingActions';

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

function ActionBanner({ action, onDismiss }: { action: PendingAction; onDismiss: () => void }) {
  const navigate = useNavigate();
  const icon = action.actionType === 'review_application'
    ? <Clock className="h-4 w-4 text-amber-600 shrink-0" />
    : <Eye className="h-4 w-4 text-pink-600 shrink-0" />;

  const message = action.actionType === 'review_application'
    ? `${action.creatorName} applied to "${action.campaignTitle}" ${action.daysAgo} day${action.daysAgo !== 1 ? 's' : ''} ago`
    : `${action.creatorName} submitted content for "${action.campaignTitle}" ${action.daysAgo} day${action.daysAgo !== 1 ? 's' : ''} ago`;

  const ctaLabel = action.actionType === 'review_application' ? 'Review Application →' : 'Review Content →';

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

export function PendingActionBanners() {
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
    <div className="space-y-2">
      {shown.map(action => (
        <ActionBanner
          key={`${action.actionType}-${action.campaignId}`}
          action={action}
          onDismiss={() => handleDismiss(action.campaignId)}
        />
      ))}
      {remaining > 0 && (
        <p className="text-xs text-amber-600 font-medium pl-1">
          + {remaining} more campaign{remaining !== 1 ? 's' : ''} need attention
        </p>
      )}
    </div>
  );
}
