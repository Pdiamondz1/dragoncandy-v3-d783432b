import { DonnyAvatar } from './DonnyAvatar';
import { DonnyNudgeCard } from './DonnyNudgeCard';
import { DonnyTrayInput } from './DonnyTrayInput';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { getSuggestionsForPage } from '@/lib/donny/helpSuggestions';
import { cn } from '@/lib/utils';

interface DonnyTrayProps {
  /** 'mobile' puts the input directly under the header with suggestions scrolling below it. */
  variant?: 'desktop' | 'mobile';
}

export function DonnyTray({ variant = 'desktop' }: DonnyTrayProps) {
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

  const pageSuggestions = getSuggestionsForPage(window.location.pathname);

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

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
      <DonnyAvatar size="sm" state={avatarState} />
      <span className="font-bold text-sm text-gray-900">Donny</span>
      {unreadCount > 0 && (
        <span className="text-xs font-semibold text-dc-teal bg-teal-50 px-2 py-0.5 rounded-full">
          {unreadCount} new
        </span>
      )}
    </div>
  );

  const nudgeList = nudges.map((nudge) => (
    <DonnyNudgeCard
      key={nudge.id}
      nudge={nudge}
      onAction={(action) => executeAction(nudge.id, action)}
      onDismiss={() => dismissNudge(nudge.id)}
    />
  ));

  const pageHelpSection = pageSuggestions.length > 0 && (
    <div className="px-3 py-2 border-t border-gray-100">
      <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Help on this page</p>
      <div className="flex flex-wrap gap-1.5">
        {pageSuggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => handleChipTap(s.question, true)}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border bg-gray-50 border-gray-200 text-gray-600 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const quickChipsSection = quickChips.length > 0 && (
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
  );

  const input = <DonnyTrayInput onSubmit={handleInputSubmit} onFocus={expand} />;

  if (variant === 'mobile') {
    return (
      <div className="flex flex-col h-full bg-white pb-[env(safe-area-inset-bottom)]">
        {header}
        {/* Input first — the primary action, full-size under the header */}
        {input}
        {/* Everything else scrolls below the input */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {nudges.length > 0 ? (
            <div className="px-3 py-2 space-y-2">{nudgeList}</div>
          ) : (
            <div className="text-center py-4 text-gray-400 text-sm">
              All caught up! No new notifications.
            </div>
          )}
          {pageHelpSection}
          {quickChipsSection}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white pb-[env(safe-area-inset-bottom)]">
      {header}

      {/* Nudge cards */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {nudges.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            All caught up! No new notifications.
          </div>
        )}
        {nudgeList}
      </div>

      {pageHelpSection}
      {quickChipsSection}
      {input}
    </div>
  );
}
