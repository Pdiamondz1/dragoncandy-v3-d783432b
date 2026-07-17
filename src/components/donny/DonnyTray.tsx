import { DonnyPanelHeader } from './DonnyPanelHeader';
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
    close,
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
    <DonnyPanelHeader
      avatarState={avatarState}
      unreadCount={unreadCount}
      onExpand={expand}
      onClose={close}
    />
  );

  const nudgeList = nudges.map((nudge) => (
    <DonnyNudgeCard
      key={nudge.id}
      nudge={nudge}
      onAction={(action) => executeAction(nudge.id, action)}
      onDismiss={() => dismissNudge(nudge.id)}
    />
  ));

  // Warm, action-forward empty state — leads with what Donny can do instead of
  // a flat "nothing here" message.
  const emptyState = (
    <div className="text-center px-4 py-8">
      <div className="text-2xl mb-1">🎉</div>
      <p className="text-sm font-semibold text-dc-text">You're all caught up!</p>
      <p className="text-xs text-dc-text-muted mt-1">
        Pick a quick action below, or ask me anything.
      </p>
    </div>
  );

  const pageHelpSection = pageSuggestions.length > 0 && (
    <div className="px-3 py-2 border-t border-dc-teal/15">
      <p className="text-[10px] text-dc-text-muted mb-1 uppercase tracking-wide">Help on this page</p>
      <div className="flex flex-wrap gap-1.5">
        {pageSuggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => handleChipTap(s.question, true)}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border bg-white border-dc-teal/40 text-dc-teal-btn hover:bg-dc-teal/5 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const quickChipsSection = quickChips.length > 0 && (
    <div className="px-3 py-2 border-t border-dc-teal/15">
      <p className="text-[10px] text-dc-text-muted mb-1 uppercase tracking-wide">Quick actions</p>
      <div className="flex flex-wrap gap-1.5">
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            onClick={() => handleChipTap(chip.message, chip.requiresChat)}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              chip.variant === 'teal'
                ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100'
                : 'bg-pink-50 border-pink-300 text-pink-700 hover:bg-pink-100'
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
            emptyState
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
        {nudges.length === 0 && emptyState}
        {nudgeList}
      </div>

      {pageHelpSection}
      {quickChipsSection}
      {input}
    </div>
  );
}
