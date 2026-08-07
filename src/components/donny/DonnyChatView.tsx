import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DonnyPanelHeader } from './DonnyPanelHeader';
import { DonnyChatInput } from './DonnyChatInput';
import { DonnyMessage } from './DonnyMessage';
import { DonnyDateDivider } from './DonnyDateDivider';
import { startsNewDayGroup } from './donnyTime';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { DonnyQuickChips } from './DonnyQuickChips';
import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useVisualViewportOffset } from '@/hooks/useVisualViewportOffset';
import { WebOnly } from '@/components/platform/WebOnly';

export function DonnyChatView() {
  const {
    messages,
    avatarState,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    quickChips,
    collapse,
    close,
    retry,
  } = useDonnyContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keyboard height on mobile (visualViewport tracks the iOS/Android keyboard;
  // dvh does not). 0 on desktop — gated so devtools/pinch resizes never pad.
  const kbOffset = useVisualViewportOffset(window.matchMedia('(max-width: 767px)').matches);

  // Auto-scroll to bottom on new messages (and when the keyboard opens)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isStreaming, streamingContent, kbOffset]);

  const handleChipTap = (message: string) => {
    sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-white pt-[env(safe-area-inset-top)]" style={{ paddingBottom: kbOffset }}>
      <DonnyPanelHeader
        avatarState={avatarState}
        onCollapse={collapse}
        onClose={close}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 bg-teal-50/30 space-y-3" role="log" aria-label="Donny conversation" aria-live="polite">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <DonnyAvatar size="lg" className="mb-2" />
            <p className="text-sm font-semibold text-dc-text">Hey! I'm Donny</p>
            <p className="text-xs text-dc-text-muted mt-1">Ask me anything — find creators, manage campaigns, check analytics, or just brainstorm ideas.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <Fragment key={msg.id ?? i}>
            {startsNewDayGroup(messages, i) && <DonnyDateDivider iso={msg.created_at} />}
            <DonnyMessage
              message={msg}
              avatarState={avatarState}
              isLatestAssistant={
                msg.role === 'assistant' &&
                (() => { const idx = messages.length - 1 - [...messages].reverse().findIndex((m) => m.role === 'assistant'); return idx >= 0 && idx < messages.length && i === idx; })()
              }
            />
          </Fragment>
        ))}
        {isStreaming && !streamingContent && <DonnyTypingIndicator />}
        {isStreaming && streamingContent && (
          <div className="flex gap-2 items-end">
            <DonnyAvatar size="sm" state="thinking" />
            <div className="max-w-[80%]">
              <div className="bg-dc-pink rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <p className="donny-markdown text-sm text-dc-text leading-relaxed whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1.5 h-4 bg-dc-text/40 animate-pulse ml-0.5 align-text-bottom" />
                </p>
              </div>
            </div>
          </div>
        )}
        {error && !isStreaming && (
          <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
            <div className="flex gap-2 mt-1.5">
              {error.includes('Upgrade') && (
                <WebOnly>
                  <Link to="/settings/billing"
                    className="text-xs text-dc-teal font-semibold">
                    Upgrade Plan
                  </Link>
                </WebOnly>
              )}
              {!error.includes('Upgrade') && (
                <button type="button" onClick={retry}
                  className="text-xs text-dc-teal font-semibold">
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick chips */}
      {quickChips.length > 0 && !isStreaming && (
        <div className="px-3 py-1.5 border-t border-gray-100">
          <DonnyQuickChips
            chips={quickChips.map((c) => ({ label: c.label, message: c.message }))}
            onChipTap={handleChipTap}
          />
        </div>
      )}

      <DonnyChatInput onSubmit={sendMessage} disabled={isStreaming} />
    </div>
  );
}
