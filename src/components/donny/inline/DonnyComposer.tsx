import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Grows to about eight lines, then scrolls internally. A pill cannot do this,
// which is why the composer is a rounded rectangle.
const MAX_COMPOSER_HEIGHT = 200;

interface DonnyComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  /**
   * Lets DonnyProvider focus this field when a launcher is tapped. Must be
   * referentially stable (e.g. `useCallback(..., [])`) — the effect below
   * keys off its identity, so a new function every render would
   * unregister/re-register on every keystroke.
   */
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
  // Matches ChatGPT per platform (founder decision). Same 768px boundary the
  // rest of the app branches on.
  const isMobile = useIsMobile();

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
    // A phone keyboard has no Shift+Enter, so Enter-sends would leave the
    // multi-line composer unable to produce a newline at all — which is the
    // complaint this composer exists to fix. On mobile Enter is a newline and
    // the send button is the only way to submit; desktop keeps Enter to send.
    if (isMobile) return;
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
          {/* md:, not sm: — the hint has to appear at exactly the width where
              the behaviour it describes turns on (useIsMobile's 768px). At sm:
              it would have promised "Enter to send" across the 640–767 band,
              where Enter now inserts a newline. */}
          <span className="hidden text-xs text-dc-text-muted md:inline">
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
