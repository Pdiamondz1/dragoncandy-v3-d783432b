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
    <div data-tour="brief-generator" className="space-y-4">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Ask Donny"
          placeholder="Ask Donny anything…"
          // The page's primary control, so it is sized and weighted like one:
          // a 2px teal border and a soft teal fill instead of a hairline on
          // white, which left it flat against the page ground.
          className="w-full rounded-full border-2 border-dc-teal bg-dc-teal/[0.06] py-5 pl-6 pr-16 text-base lg:text-lg text-dc-text shadow-dc-sm placeholder:text-dc-text/60 focus:border-dc-teal-dark focus:outline-none focus:ring-2 focus:ring-dc-teal/40"
        />
        <button
          type="submit"
          aria-label="Send to Donny"
          disabled={!text.trim()}
          // opacity-70 (not 40) when empty: the field starts empty, so a
          // heavily dimmed button meant the one saturated element on the
          // dashboard rendered greyed-out before the user touched anything.
          className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-70"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
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
