// The conversation as a BOUNDED, scrollable region, plus the scroll-to-bottom
// control. Founder, on prod: "On the Desktop the conversation just keep running
// down endlessly and there's no scroll button."
//
// Before this, the thread rendered straight into page flow with no height, so
// the page grew a screen per exchange, prior days included — and because the
// composer sat ABOVE it, the newest message was the furthest thing from the box
// you type in. Asking a follow-up meant scrolling back up past everything.
//
// Why a real scroll container rather than `position: sticky` on the composer:
// sticky is INERT anywhere inside DashboardLayout. Its root carries
// `overflow-x-hidden`, as does the mobile content wrapper, and per CSS Overflow
// 3 a non-visible overflow on one axis computes the other to `auto` — so those
// become the nearest scroll container. Both are `min-h-screen` with
// content-driven height, so neither ever scrolls, and a sticky composer would
// silently never pin. Giving the thread its own scroller means the composer is
// just a normal flex sibling underneath it: no sticky, no fixed, and no
// z-index fight with MobileBottomNav.
import React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DonnyThread } from './DonnyThread';
import type { DonnyMessage as DonnyMessageType, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

// Within this many px of the bottom still counts as "at the bottom". Sub-pixel
// line boxes mean scrollHeight - scrollTop - clientHeight rarely lands exactly
// on 0, and a control that flickers into view on a rounding error is worse than
// no control.
const BOTTOM_EPSILON = 24;

interface DonnyThreadRegionProps {
  messages: DonnyMessageType[];
  avatarState: DonnyAvatarState;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  retry: () => void;
  userRole: UserRole;
  /** Sizing comes from the parent — this component owns scrolling, not height. */
  className?: string;
}

export function DonnyThreadRegion({ className, ...thread }: DonnyThreadRegionProps) {
  const { messages, isStreaming, streamingContent } = thread;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  // Mirrored in a ref as well as state: the follow-the-reply effect must read
  // the CURRENT position without listing it as a dependency, or every scroll
  // would re-arm the effect and scroll the reader back down again.
  const atBottomRef = React.useRef(true);

  const readPosition = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPSILON;
    atBottomRef.current = next;
    setAtBottom(next);
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // Set directly rather than waiting for the scroll event: a programmatic
    // scrollTop write does not always emit one synchronously, and the control
    // must disappear on the click that used it.
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // Follow the reply down — but only for a reader who is already at the bottom.
  // Yanking someone who scrolled up to re-read an earlier answer is the defect
  // the scroll-to-bottom control exists to let them undo deliberately.
  React.useEffect(() => {
    if (!atBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming, streamingContent]);

  return (
    // The control is positioned against THIS wrapper, not the scroller: inside
    // the scroller it would scroll away with the content it is meant to chase.
    // Keeping it in here also keeps it clear of MobileBottomNav — it can never
    // reach the app chrome because it can never leave this box.
    <div className={cn('relative flex flex-col', className)}>
      <div
        ref={scrollerRef}
        onScroll={readPosition}
        role="log"
        aria-label="Donny conversation"
        aria-live="polite"
        // `flex-1 min-h-0`, NOT `h-full`. h-full is `height: 100%`, and a
        // percentage height only resolves against a parent whose `height`
        // PROPERTY is definite. Every ancestor here sizes itself with
        // min-h/max-h and leaves `height: auto`, so the percentage never
        // resolved — it fell back to content height. Measured on the real page:
        // the scroller computed to 8337px inside a 145px parent, so
        // `overflow-y-auto` had nothing to overflow and the thread painted
        // straight over the attention list below it.
        //
        // Flex sizing needs no definite parent height: this box is a flex item,
        // so it is measured against its parent's USED height. `min-h-0` is
        // load-bearing — a flex item's default `min-height: auto` refuses to
        // shrink below its content, which would reproduce the same overflow.
        //
        // jsdom cannot catch this class of bug: it performs no layout, so the
        // class-value pin in the test file passes on the broken version too.
        // The proof is a DOM measurement in a real browser.
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-dc-teal/15 bg-dc-teal/[0.04] p-4"
      >
        <DonnyThread {...thread} />
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-dc-teal/30 bg-white text-dc-teal-btn shadow-dc-sm transition-colors hover:bg-dc-teal/10"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
