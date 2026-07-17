import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';

interface DonnyTrayInputProps {
  onSubmit: (message: string) => void;
  onFocus: () => void;
}

export function DonnyTrayInput({ onSubmit, onFocus }: DonnyTrayInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 md:py-2 border-b md:border-b-0 md:border-t border-dc-teal/15">
      <label htmlFor="donny-tray-input" className="sr-only">Message Donny</label>
      {/* readOnly: focus expands to full chat before any keystroke could land,
          so suppress the iOS keyboard flash during the tray→chat transition */}
      <input
        id="donny-tray-input"
        type="text"
        value={value}
        readOnly
        onChange={(e) => setValue(e.target.value)}
        onFocus={onFocus}
        placeholder="Ask Donny anything..."
        aria-label="Message Donny"
        className="flex-1 bg-dc-teal/5 rounded-full py-2.5 md:py-2 px-4 text-base md:text-sm text-dc-text placeholder:text-dc-text-muted outline-none focus:ring-2 focus:ring-dc-teal/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send message"
        className="w-9 h-9 md:w-7 md:h-7 rounded-full bg-dc-dark flex items-center justify-center text-white disabled:opacity-30"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
