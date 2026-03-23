import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DonnyAvatar } from './DonnyAvatar';
import { DonnyMessage } from './DonnyMessage';
import { DonnyQuickChips } from './DonnyQuickChips';
import { DonnyTypingIndicator } from './DonnyTypingIndicator';
import { useDonny } from '@/hooks/useDonny';
import { X, Plus, ArrowUp } from 'lucide-react';

interface DonnyChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMessage?: string;
}

export function DonnyChatSheet({ open, onOpenChange, initialMessage }: DonnyChatSheetProps) {
  const {
    messages,
    isStreaming,
    avatarState,
    error,
    sendMessage,
    quickChips,
  } = useDonny();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Send initial message if provided (from DonnyCard tap)
  useEffect(() => {
    if (open && initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      sendMessage(initialMessage);
    }
    if (!open) {
      initialMessageSentRef.current = false;
    }
  }, [open, initialMessage, sendMessage]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-3xl p-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white rounded-t-3xl">
          <DonnyAvatar size="md" state={avatarState} />
          <div className="flex-1">
            <div className="text-sm font-bold text-[#111]">Donny</div>
            <div className="text-xs text-[#4DD9C0]">Always here for you</div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[#888] hover:text-[#111] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-[#A8A8A0]">
          {messages.length === 0 && !isStreaming && (
            <div className="flex gap-2 items-end">
              <DonnyAvatar size="sm" state="idle" />
              <div className="bg-[#F9A8D4] rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[80%]">
                <p className="text-sm text-[#111] leading-relaxed">
                  Hey! I'm Donny, your DragonCandy assistant. I can help you create campaigns, find creators, manage content, and more. What can I do for you?
                </p>
              </div>
            </div>
          )}

          {messages
            .filter((m) => m.role !== 'tool')
            .map((message, index, filtered) => (
              <DonnyMessage
                key={message.id}
                message={message}
                avatarState={avatarState}
                isLatestAssistant={
                  message.role === 'assistant' &&
                  index === filtered.length - 1
                }
              />
            ))}

          {isStreaming && <DonnyTypingIndicator />}

          {error && (
            <div className="text-center text-xs text-red-600 bg-red-50 rounded-lg p-2 mx-4">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick chips */}
        <DonnyQuickChips
          chips={quickChips}
          onChipTap={(message) => sendMessage(message)}
          disabled={isStreaming}
        />

        {/* Input bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-t">
          <button className="w-8 h-8 bg-[#111] rounded-full flex items-center justify-center flex-shrink-0">
            <Plus className="w-4 h-4 text-white" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Donny..."
            rows={1}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm resize-none outline-none max-h-20 placeholder:text-[#999]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 bg-[#111] rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <ArrowUp className="w-4 h-4 text-white" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
