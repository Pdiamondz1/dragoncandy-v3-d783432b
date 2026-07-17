import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyNudge, NudgeAction } from '@/types/donnyNudge';
import { cn } from '@/lib/utils';

interface DonnyNudgeCardProps {
  nudge: DonnyNudge;
  onAction: (action: NudgeAction) => void;
  onDismiss: () => void;
}

const priorityStyles = {
  high: 'bg-gradient-to-r from-dc-teal/10 to-emerald-500/10 border-dc-teal/30',
  medium: 'bg-gradient-to-r from-dc-pink/10 to-fuchsia-500/10 border-dc-pink-accent/30',
  low: 'bg-white/5 border-white/10',
};

const variantStyles = {
  primary: 'bg-dc-teal-btn text-white',
  secondary: 'bg-white/5 text-white/60 border border-white/10',
  ghost: 'bg-white/5 text-white/60',
};

export function DonnyNudgeCard({ nudge, onAction, onDismiss }: DonnyNudgeCardProps) {
  return (
    <div className={cn('rounded-xl border p-3 transition-all', priorityStyles[nudge.priority])}>
      <div className="flex items-start gap-2 mb-2">
        <DonnyAvatar size="xs" />
        <p className="text-sm text-white/80 flex-1">{nudge.summary}</p>
        <button
          onClick={onDismiss}
          className="text-white/40 hover:text-white/60 text-xs leading-none"
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
