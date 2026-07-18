import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyNudge, NudgeAction } from '@/types/donnyNudge';
import { cn } from '@/lib/utils';

interface DonnyNudgeCardProps {
  nudge: DonnyNudge;
  onAction: (action: NudgeAction) => void;
  onDismiss: () => void;
}

const priorityStyles = {
  high: 'bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-300',
  medium: 'bg-gradient-to-r from-pink-50 to-fuchsia-50 border-pink-300',
  low: 'bg-dc-teal/[0.04] border-dc-teal/10',
};

const variantStyles = {
  primary: 'bg-dc-teal-btn text-white',
  secondary: 'bg-white text-gray-600 border border-dc-teal/15',
  ghost: 'bg-dc-teal/5 text-dc-text-muted',
};

export function DonnyNudgeCard({ nudge, onAction, onDismiss }: DonnyNudgeCardProps) {
  return (
    <div className={cn('rounded-xl border p-3 transition-all', priorityStyles[nudge.priority])}>
      <div className="flex items-start gap-2 mb-2">
        <DonnyAvatar size="xs" />
        <p className="text-sm text-gray-700 flex-1">{nudge.summary}</p>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 text-xs leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {nudge.actions.length > 0 && (
        <div className="flex gap-1.5 ml-7">
          {nudge.actions.map((action) => (
            <button
              key={action.action}
              onClick={() => onAction(action)}
              className={cn(
                'flex-1 text-center py-1.5 px-3 rounded-full text-xs font-semibold transition-colors',
                variantStyles[action.variant]
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
