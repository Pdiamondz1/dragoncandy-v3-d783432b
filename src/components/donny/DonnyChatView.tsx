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
    <div className="flex flex-col h-full bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <DonnyChatHeader
        avatarState={avatarState}
        onCollapse={collapse}
        onClose={close}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 bg-teal-50/30 space-y-3">
        {messages.map((msg, i) => (
          <DonnyMessage
            key={msg.id ?? i}
            message={msg}
            avatarState={avatarState}
            isLatestAssistant={
              msg.role === 'assistant' &&
              i === messages.findLastIndex((m) => m.role === 'assistant')
            }
          />
        ))}
        {isStreaming && <DonnyTypingIndicator />}
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
