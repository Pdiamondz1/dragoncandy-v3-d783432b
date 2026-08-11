import { useEffect, useRef } from 'react';
import { DonnyPanelHeader } from './DonnyPanelHeader';
import { DonnyChatInput } from './DonnyChatInput';
import { DonnyThread } from './DonnyThread';
import { DonnyQuickChips } from './DonnyQuickChips';
import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useVisualViewportOffset } from '@/hooks/useVisualViewportOffset';

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
    userRole,
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
        <DonnyThread
          messages={messages}
          avatarState={avatarState}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          error={error}
          retry={retry}
          userRole={userRole}
        />
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
