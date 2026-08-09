import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Grows to about eight lines, then scrolls internally. A pill cannot do this,
// which is why the composer is a rounded rectangle.
const MAX_COMPOSER_HEIGHT = 200;

interface DonnyComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  /** Lets DonnyProvider focus this field when a launcher is tapped. */
  registerRef?: (el: HTMLTextAreaElement | null) => void;
  variant?: 'resting' | 'stuck';
}

export function DonnyComposer({
  onSubmit,
  disabled = false,
  registerRef,
  variant = 'resting',
}: DonnyComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [text]);

  useEffect(() => {
    registerRef?.(ref.current);
    return () => registerRef?.(null);
  }, [registerRef]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME candidate window swallows Enter to confirm a word. Submitting here
    // would send a half-composed one — a bug DonnyChatInput and
    // MessageInputEnhanced both still have.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div data-tour="brief-generator" className="w-full">
      <form
        onSubmit={handleSubmit}
        className={cn(
          'flex w-full flex-col gap-2 rounded-3xl border-2 border-dc-teal bg-white px-4 pb-3 pt-3 shadow-dc-sm',
          'focus-within:border-dc-teal-dark focus-within:ring-2 focus-within:ring-dc-teal/40',
          variant === 'stuck' && 'shadow-lg'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Ask Donny"
          placeholder="Ask Donny anything…"
          className="w-full resize-none bg-transparent text-base text-dc-text placeholder:text-dc-text/60 focus:outline-none lg:text-lg"
        />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-dc-text-muted sm:inline">
            Enter to send · Shift+Enter for a new line
          </span>
          <button
            type="submit"
            aria-label="Send to Donny"
            disabled={!text.trim() || disabled}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-50"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
