import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Plus } from 'lucide-react';

interface DonnyChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

const MAX_INPUT_HEIGHT = 160;

export function DonnyChatInput({ onSubmit, disabled }: DonnyChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea to fit its content (up to MAX_INPUT_HEIGHT, then
  // scroll internally) so the full message stays visible while typing.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-white border-t border-dc-teal/10">
      <button type="button" aria-label="Attach file" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white flex-shrink-0">
        <Plus className="w-4 h-4" />
      </button>
      <label htmlFor="donny-chat-input" className="sr-only">Message Donny</label>
      <textarea
        id="donny-chat-input"
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Donny anything..."
        disabled={disabled}
        aria-label="Message Donny"
        className="flex-1 resize-none min-h-[36px] max-h-[160px] overflow-y-auto bg-white border border-dc-teal/20 rounded-2xl py-2 px-4 text-base md:text-sm text-dc-text placeholder:text-dc-text-muted outline-none focus:ring-2 focus:ring-dc-teal/30 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Send message"
        className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-30"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
