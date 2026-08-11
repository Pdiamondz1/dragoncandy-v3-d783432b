// The prompt box and the curated taps. Presentational: the container decides
// what "submit" means and records the analytics.
//
// The field is a TEXTAREA, not a single-line pill. Two founder complaints, one
// cause: "you cannot press Enter without submitting the prompt (therefore not
// allowing you to paragraph your prompts)" and "it doesn't display the entire
// prompt as a whole". A one-line `<input>` can do neither — it has no newline
// and it scrolls the text sideways out of view.
import React from 'react';
import { ArrowUp } from 'lucide-react';
import { AppChip } from '@/components/app/AppChip';
import { useIsMobile } from '@/hooks/use-mobile';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

// Grows to about eight lines, then scrolls internally rather than pushing the
// attention list off the screen. A pill cannot do this, which is why the
// composer is a rounded rectangle.
const MAX_COMPOSER_HEIGHT = 200;

interface DonnyHomePromptProps {
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (suggestion: DonnySuggestion) => void;
  /** A reply is in flight. Mirrors the panel, which disables its own input. */
  busy?: boolean;
  /**
   * A conversation is running, so this is a chat composer rather than the
   * page's hero: no suggestion chips, and no gap reserved for them.
   *
   * The chips are a cold-start affordance — "Create a campaign" is help for
   * someone who has not asked anything yet. Keeping them mid-conversation
   * spends a fifth of a phone screen suggesting openers to someone already past
   * that, and pushes the thread further up.
   *
   * Named for what it does, not for a viewport: the trigger is the
   * conversation, and it applies on desktop too.
   */
  compact?: boolean;
}

export function DonnyHomePrompt({
  suggestions,
  onSubmit,
  onSuggestionTap,
  busy = false,
  compact = false,
}: DonnyHomePromptProps) {
  const [text, setText] = React.useState('');
  const fieldRef = React.useRef<HTMLTextAreaElement>(null);
  // Matches ChatGPT per platform (founder decision). Same 768px boundary the
  // rest of the app branches on; it initialises synchronously from
  // window.innerWidth, so the first keystroke already knows the viewport.
  const isMobile = useIsMobile();

  // Reset to `auto` first: scrollHeight is clamped by the element's own current
  // height, so measuring without the reset makes the box grow but never shrink.
  React.useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    // The `busy` check is here as well as on the button, because Enter submits
    // without going near the button's disabled state. Clearing the box for a
    // send that will not happen is how a follow-up disappears.
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // FIRST, before any other branch. An IME candidate window swallows Enter to
    // confirm a word; submitting here would send a half-composed one.
    if (e.nativeEvent.isComposing) return;
    // A phone keyboard has no Shift+Enter, so Enter-sends would leave the
    // multi-line composer unable to produce a newline at all — which is the
    // complaint this composer exists to fix. On mobile Enter falls through to
    // the browser default (a newline) with NO preventDefault, and the send
    // button is the only way to submit; desktop keeps Enter to send.
    if (isMobile) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    // RESTAURANT_TOUR step 2 targets this anchor. It used to live on
    // HeroPrimaryAction, which this body replaces.
    <div data-tour="brief-generator" className={compact ? undefined : 'space-y-4'}>
      <form
        onSubmit={handleSubmit}
        // One quiet outline. Founder, on prod: "there a border around prompt
        // input which is unneccessary." It was a 2px teal border over a teal
        // fill, and on focus it added a ring on top of that while the textarea
        // contributed an outline of its own — three signals for one state, read
        // as a double border. Now it is the documented light-app card treatment
        // (hairline dc-teal on white, docs/DESIGN_SYSTEM.md), and focus is
        // EXACTLY one change: the same hairline darkens to dc-teal-btn. Dark
        // teal rather than dc-teal because this border is now the only focus
        // indicator on the composer — #0F766E clears 3:1 against white,
        // #4DD9C0 does not. The width never changes, so nothing reflows.
        className="flex w-full flex-col gap-2 rounded-3xl border border-dc-teal/20 bg-white px-5 py-4 shadow-dc-sm focus-within:border-dc-teal-btn"
      >
        <textarea
          ref={fieldRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Ask Donny"
          // Deliberately NOT disabled while busy — the owner keeps composing
          // their follow-up while Donny answers. Only the send button is
          // disabled, so nothing is sent into the silent early return in
          // useDonny.sendMessage.
          placeholder={busy ? 'Donny is answering…' : 'Ask Donny anything…'}
          // `focus:outline-none` alone does NOT hold, which is why the founder's
          // screenshot shows a second outline inside the border. src/index.css
          // has a global `*:focus-visible { ring-2 ring-ring ring-offset-2 }` in
          // @layer base, and a Tailwind ring is a BOX-SHADOW — outline-none
          // cannot touch it. ring-0 alone is not enough either: the ring shadow
          // is drawn at calc(width + offset), so a 0-width ring with a 2px
          // offset still paints. Both are needed, and being utilities they beat
          // the base layer regardless of specificity. Focus stays visible — the
          // form's focus-within border above is the indicator now.
          className="w-full resize-none overflow-y-auto bg-transparent text-base text-dc-text placeholder:text-dc-text/60 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:text-lg"
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
            disabled={!text.trim() || busy}
            // opacity-70 (not 40) when empty: the field starts empty, so a
            // heavily dimmed button meant the one saturated element on the
            // dashboard rendered greyed-out before the user touched anything.
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-dc-teal-btn text-white transition-colors hover:bg-dc-teal-btn-hover disabled:opacity-70"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>

      {!compact && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <AppChip
              key={s.message}
              className="text-dc-teal-btn border-dc-teal/30 disabled:opacity-50"
              disabled={busy}
              onClick={() => onSuggestionTap(s)}
            >
              {s.label}
            </AppChip>
          ))}
        </div>
      )}
    </div>
  );
}
