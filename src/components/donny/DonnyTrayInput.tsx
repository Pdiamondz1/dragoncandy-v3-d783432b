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
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={onFocus}
        placeholder="Ask Donny anything..."
        className="flex-1 bg-gray-100 rounded-full py-2 px-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-dc-teal/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white disabled:opacity-30"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
