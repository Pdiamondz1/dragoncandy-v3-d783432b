// The prompt box and the curated taps. Presentational: the container decides
// what "submit" means and records the analytics.
import React from 'react';
import { ArrowUp } from 'lucide-react';
import { AppChip } from '@/components/app/AppChip';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

interface DonnyHomePromptProps {
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (suggestion: DonnySuggestion) => void;
}

export function DonnyHomePrompt({
  suggestions,
  onSubmit,
  onSuggestionTap,
}: DonnyHomePromptProps) {
  const [text, setText] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    // RESTAURANT_TOUR step 2 targets this anchor. It used to live on
    // HeroPrimaryAction, which this body replaces.
    <div data-tour="brief-generator" className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Ask Donny"
          placeholder="Ask Donny anything…"
          className="w-full rounded-full border border-dc-teal/20 bg-white py-3.5 pl-5 pr-14 text-base text-dc-text placeholder:text-dc-text-muted focus:border-dc-teal focus:outline-none focus:ring-2 focus:ring-dc-teal/30"
        />
        <button
          type="submit"
          aria-label="Send to Donny"
          disabled={!text.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <AppChip
            key={s.message}
            className="text-dc-teal-btn border-dc-teal/30"
            onClick={() => onSuggestionTap(s)}
          >
            {s.label}
          </AppChip>
        ))}
      </div>
    </div>
  );
}
