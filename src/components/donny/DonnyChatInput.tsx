import { useState, type FormEvent } from 'react';
import { Send, Plus } from 'lucide-react';

interface DonnyChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export function DonnyChatInput({ onSubmit, disabled }: DonnyChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-100">
      <button type="button" aria-label="Attach file" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white flex-shrink-0">
        <Plus className="w-4 h-4" />
      </button>
      <label htmlFor="donny-chat-input" className="sr-only">Message Donny</label>
      <input
        id="donny-chat-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Donny anything..."
        disabled={disabled}
        aria-label="Message Donny"
        className="flex-1 bg-gray-100 rounded-full py-2 px-4 text-base md:text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-dc-teal/30 disabled:opacity-50"
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
