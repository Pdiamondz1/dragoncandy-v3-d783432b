import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppChip } from '@/components/app/AppChip';
import { cn } from '@/lib/utils';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { DonnyComposer } from './DonnyComposer';
import { DonnyThread } from './DonnyThread';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

const OVERVIEW_ROUTE = '/dashboard/business/overview';

interface DonnyCanvasProps {
  suggestions: DonnySuggestion[];
  onSuggestionTap: (s: DonnySuggestion) => void;
  onPromptSubmit: (text: string) => void;
  /** Resting-state dashboard content — e.g. the attention list. Hidden (unmounted) in thread mode. */
  children?: ReactNode;
}

// The only stateful piece of the inline Donny surface: owns the
// resting<->thread switch, claims the 'inline' stage while mounted, registers
// the composer so header/nav launchers can focus it, and anchors scrolling to
// the app's real scroller (#main-content) rather than an internal div.
export function DonnyCanvas({ suggestions, onSuggestionTap, onPromptSubmit, children }: DonnyCanvasProps) {
  const {
    setInline,
    exitInline,
    registerInlineComposer,
    markAllRead,
    unreadCount,
    messages,
    isStreaming,
    streamingContent,
    error,
    retry,
  } = useDonnyContext();

  // Starts 'resting' on every mount regardless of message count (D6) — the
  // conversation may already hold fifty turns; landing on the dashboard still
  // shows the dashboard, not a resumed thread.
  const [mode, setMode] = useState<'resting' | 'thread'>('resting');

  // Claim the stage for as long as this canvas is mounted. Unconditional on
  // purpose: it also closes a panel opened on another page, because nothing
  // resets stage on navigation.
  useEffect(() => {
    setInline();
    return () => exitInline();
  }, [setInline, exitInline]);

  // markAllRead runs in its OWN effect, read through a ref — deliberately NOT
  // a dependency of the stage effect above. useDonnyNudges declares markAllRead
  // as useCallback(..., [user?.id, nudges]), and `nudges` is a React Query
  // array whose identity changes on every refetch. Adding it to the stage
  // effect's deps would re-run that effect (and its exitInline cleanup) on
  // every nudge refetch, thrashing the 'inline' stage and the
  // enabled: stage !== 'closed' gate downstream. A ref sidesteps the unstable
  // identity while still calling the current implementation.
  //
  // Keyed on unreadCount, NOT mount-once: markAllRead's own guard reads a
  // closure snapshot of `nudges` and returns early when it is empty, so a
  // single call at mount is a no-op on every load where the nudges query has
  // not resolved yet — and nothing retried it, leaving the launcher badge
  // reading "3" forever. The underlying UPDATE is `.is('read_at', null)`, so
  // re-firing is idempotent.
  const markAllReadRef = useRef(markAllRead);
  useEffect(() => {
    markAllReadRef.current = markAllRead;
  }, [markAllRead]);
  useEffect(() => {
    if (unreadCount <= 0) return;
    void Promise.resolve(markAllReadRef.current()).catch((err) =>
      console.error('[DonnyCanvas] markAllRead failed', err)
    );
  }, [unreadCount]);

  const handleSubmit = (text: string) => {
    // Flip to thread BEFORE calling onPromptSubmit, so the thread is already
    // mounted when the reply lands.
    setMode('thread');
    onPromptSubmit(text);
  };

  const handleSuggestionTap = (suggestion: DonnySuggestion) => {
    setMode('thread');
    onSuggestionTap(suggestion);
  };

  // Scroll anchoring: the app's real scroller is #main-content
  // (window.scrollY is always 0 in this shell), not an internal div —
  // DonnyThread deliberately owns no scroller of its own.
  //
  // streamingContent is deliberately absent from this dependency array — on
  // a page-length scroller it would fight the user's own scroll on every
  // delta. DonnyChatView.tsx includes it only because it drives a short
  // fixed-height panel, not a full-page scroller.
  useEffect(() => {
    if (mode !== 'thread') return;
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, [mode, messages.length]);

  return (
    <div className="flex flex-col gap-6">
      {mode === 'thread' && (
        <Link
          to={OVERVIEW_ROUTE}
          className="self-start text-sm font-semibold text-dc-teal-btn hover:underline"
        >
          ← Dashboard
        </Link>
      )}

      {mode === 'resting' && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <AppChip
              key={s.message}
              className="text-dc-teal-btn border-dc-teal/30"
              onClick={() => handleSuggestionTap(s)}
            >
              {s.label}
            </AppChip>
          ))}
        </div>
      )}

      {mode === 'thread' && (
        <DonnyThread
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          error={error}
          onRetry={retry}
        />
      )}

      {/* The composer sits at one fixed position in the element tree in both
          states — never in a ternary — so React never remounts it across the
          resting<->thread transition. A remount here would drop half-typed
          text, focus, and any in-flight IME composition.

          The mobile offset is NOT optional. A sticky inset resolves against the
          scrollport's padding box, and the scrollport here is
          `#main-content` (App.tsx: `flex-1 overflow-auto`), which has NO
          padding — DashboardLayout's `pb-24` sits on an inner div, well inside
          it. So a bare `bottom-0` pins the composer to the viewport bottom,
          underneath MobileBottomNav (`fixed bottom-0 z-40`, opaque, portaled to
          <body> — a z-10 in here cannot beat it). Same shape and same 6rem as
          StickyApplyCTA, per docs/DESIGN_SYSTEM.md; the offset absorbs the
          safe-area inset, so no separate padding is needed. Desktop has no
          bottom nav, so `md:` resets it flush. */}
      <div
        className={cn(
          mode === 'thread' &&
            'sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 bg-white pt-3'
        )}
      >
        <DonnyComposer
          onSubmit={handleSubmit}
          disabled={isStreaming}
          registerRef={registerInlineComposer}
          variant={mode === 'thread' ? 'stuck' : 'resting'}
        />
      </div>

      {mode === 'resting' && children}
    </div>
  );
}
