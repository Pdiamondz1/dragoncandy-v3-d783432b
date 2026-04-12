import { DonnyAvatar } from './DonnyAvatar';
import { DonnyNudgeCard } from './DonnyNudgeCard';
import { DonnyTrayInput } from './DonnyTrayInput';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { cn } from '@/lib/utils';

export function DonnyTray() {
  const {
    nudges,
    unreadCount,
    quickChips,
    avatarState,
    executeAction,
    dismissNudge,
    sendMessage,
    expand,
  } = useDonnyContext();

  const handleChipTap = (message: string, requiresChat: boolean) => {
    sendMessage(message);
    if (requiresChat) {
      expand();
    }
  };

  const handleInputSubmit = (message: string) => {
    sendMessage(message);
    expand();
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <DonnyAvatar size="sm" state={avatarState} />
        <span className="font-bold text-sm text-gray-900">Donny</span>
        {unreadCount > 0 && (
          <span className="text-xs font-semibold text-dc-teal bg-teal-50 px-2 py-0.5 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Nudge cards */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {nudges.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            All caught up! No new notifications.
          </div>
        )}
        {nudges.map((nudge) => (
          <DonnyNudgeCard
            key={nudge.id}
            nudge={nudge}
            onAction={(action) => executeAction(nudge.id, action)}
            onDismiss={() => dismissNudge(nudge.id)}
          />
        ))}
      </div>

      {/* Quick chips */}
      {quickChips.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleChipTap(chip.message, chip.requiresChat)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                  chip.variant === 'teal'
                    ? 'bg-teal-50 border-teal-300 text-teal-700'
                    : 'bg-pink-50 border-pink-300 text-pink-700'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <DonnyTrayInput onSubmit={handleInputSubmit} onFocus={expand} />
    </div>
  );
}
