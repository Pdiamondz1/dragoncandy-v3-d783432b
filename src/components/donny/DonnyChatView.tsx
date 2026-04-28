import { useEffect, useRef } from 'react';
import { DonnyChatHeader } from './DonnyChatHeader';
import { DonnyChatInput } from './DonnyChatInput';
import { DonnyMessage } from './DonnyMessage';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { DonnyQuickChips } from './DonnyQuickChips';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export function DonnyChatView() {
  const {
    messages,
    avatarState,
    isStreaming,
    error,
    sendMessage,
    quickChips,
    collapse,
    close,
  } = useDonnyContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isStreaming]);

  const handleChipTap = (message: string) => {
    sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-white pt-[env(safe-area-inset-top)]">
      <DonnyChatHeader
        avatarState={avatarState}
        onCollapse={collapse}
        onClose={close}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 bg-teal-50/30 space-y-3" role="log" aria-label="Donny conversation" aria-live="polite">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="text-3xl mb-2">🐉</div>
            <p className="text-sm font-semibold text-[#111]">Hey! I'm Donny</p>
            <p className="text-xs text-[#555] mt-1">Ask me anything — find creators, manage campaigns, check analytics, or just brainstorm ideas.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <DonnyMessage
            key={msg.id ?? i}
            message={msg}
            avatarState={avatarState}
            isLatestAssistant={
              msg.role === 'assistant' &&
              (() => { const idx = messages.length - 1 - [...messages].reverse().findIndex((m) => m.role === 'assistant'); return idx >= 0 && idx < messages.length && i === idx; })()
            }
          />
        ))}
        {isStreaming && <DonnyTypingIndicator />}
        {error && !isStreaming && (
          <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">Something went wrong. Please try again.</p>
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
