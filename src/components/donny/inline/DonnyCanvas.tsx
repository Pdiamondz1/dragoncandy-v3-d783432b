import { useCallback, useEffect, useRef, useState } from 'react';
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
    clientMessageIds,
    isStreaming,
    streamingContent,
    error,
    retry,
  } = useDonnyContext();

  // Starts 'resting' on every mount regardless of message count (D6) — the
  // conversation may already hold fifty turns; landing on the dashboard still
  // shows the dashboard, not a resumed thread.
  const [mode, setMode] = useState<'resting' | 'thread'>('resting');

  // "This visit only" (founder decision) is expressed as MEMBERSHIP, not
  // position. The conversation is fetched whole and unbounded, so without a
  // rule one question would materialise every turn the user has ever exchanged
  // with Donny above the answer — and the scroll effect would then jump them to
  // the bottom of it.
  //
  // The rule used to be `messages.slice(count-at-entry)`, and an index into
  // `messages` is inherently racy: that array is still empty while the
  // stage-gated messages query is in flight, so on a cold load with prior
  // history the count was 0 and `slice(0)` meant "show all of it" the moment
  // the history arrived. `clientMessageIds` carries no such dependency — it is
  // written by this browser session at send time, so its length at entry is a
  // fact, not a snapshot of a query that may not have run. A history row can
  // never pass the test below no matter when it loads, because this session
  // never minted its id.
  //
  // The index still exists, but it now marks how much of THIS SESSION's own
  // output predates this visit (navigate away and back and the canvas remounts
  // while the provider's list does not). It moves ONLY on the resting→thread
  // edge; a second question in the same visit must not hide the first exchange.
  const visitStartRef = useRef(0);
  const enterThread = useCallback(() => {
    if (mode === 'thread') return;
    visitStartRef.current = clientMessageIds.length;
    setMode('thread');
  }, [mode, clientMessageIds.length]);

  // Recomputed every render rather than memoised: `visitStartRef` is a ref, so
  // a memo keyed on `clientMessageIds` would not see the entry edge move and
  // would serve the previous visit's set for one render. Both lists are a
  // single conversation long.
  const visitMessageIds = new Set(clientMessageIds.slice(visitStartRef.current));
  const visitMessages = messages.filter((m) => visitMessageIds.has(m.id));

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
    // mounted when the reply lands — and so the baseline is taken before the
    // send adds the user's own row.
    enterThread();
    onPromptSubmit(text);
  };

  const handleSuggestionTap = (suggestion: DonnySuggestion) => {
    enterThread();
    onSuggestionTap(suggestion);
  };

  // A send this canvas did not initiate still has to land somewhere visible.
  // DonnyHome's proposal handler calls sendMessage() directly for an 'ask'
  // CTA, and nothing in that path touches `mode` — such a tap would stream a
  // real answer, burn a Donny call, and render nothing. buildDonnyProposals
  // only emits 'route' today, but Phase 2 adds Donny-authored taps, so close
  // it here (once, generally) rather than per caller. Safe for D6: mount is
  // always 'resting' and isStreaming is false at mount, so this never fires on
  // load. The guard inside enterThread makes re-runs no-ops.
  useEffect(() => {
    if (!isStreaming) return;
    enterThread();
  }, [isStreaming, enterThread]);

  // Scroll anchoring: the app's real scroller is #main-content
  // (window.scrollY is always 0 in this shell), not an internal div —
  // DonnyThread deliberately owns no scroller of its own.
  //
  // streamingContent is deliberately absent from this dependency array — on
  // a page-length scroller it would fight the user's own scroll on every
  // delta. DonnyChatView.tsx includes it only because it drives a short
  // fixed-height panel, not a full-page scroller.
  //
  // Keyed on the RENDERED turn count, not `messages.length`: history landing
  // mid-visit changes the latter without changing anything on screen, and would
  // otherwise yank the page to the bottom for no visible reason.
  useEffect(() => {
    if (mode !== 'thread') return;
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, [mode, visitMessages.length]);

  return (
    // The thread-mode bottom padding pairs with the composer's mobile `fixed`
    // bar below: out of flow, it would otherwise cover the newest turn — the
    // one the user is waiting to read. Mobile only; on desktop the composer is
    // still in flow and provides its own space.
    <div className={cn('flex flex-col gap-6', mode === 'thread' && 'pb-32 md:pb-0')}>
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
          messages={visitMessages}
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

          WHY NOT `sticky`: it used to be, and it could not have worked.
          `position: sticky` resolves against the nearest ancestor scroll
          container, and that is NOT `#main-content` (App.tsx: `flex-1
          overflow-auto`) as you would expect. DashboardLayout sits in between
          and carries `overflow-x-hidden` on both its root (:182) and, on
          mobile, its content wrapper (:309). Per CSS Overflow 3, an
          `overflow-x` of `hidden` against an `overflow-y` of `visible`
          computes that `overflow-y` to `auto` — so those wrappers are the
          scrollport. Both are `min-h-screen` with content-driven height and
          never actually scroll, which makes a `sticky` inside them inert: the
          composer scrolled away with the thread instead of pinning.

          MOBILE — `fixed`, the repo's documented pattern for a non-modal
          in-page bottom bar (StickyApplyCTA.tsx:29, docs/DESIGN_SYSTEM.md). A
          fixed box's containing block is the viewport, so it escapes those
          overflow wrappers entirely. MobileBottomNav is `fixed bottom-0 z-40`,
          opaque, portaled to <body>; the 6rem offset mirrors the app's pb-24
          nav clearance and absorbs the safe-area inset so the composer clears
          it. z-40 is app-chrome level and must NOT reach z-50 — that is the
          Radix modal layer, and a bar tying it would paint over dialogs. Being
          out of flow, it needs the root's thread-mode pb-32 above or the last
          turn hides behind it.

          DESKTOP — deliberately IN FLOW and unpinned (`md:static`). There is no
          bottom nav to clear and nothing is broken today: the composer sits at
          the end of the content and the page scrolls. A viewport-`fixed` bar
          would misalign with the content column, which is centred inside
          <main> beside a collapsible sidebar, and correcting that needs a
          measured width. Desktop pinning is therefore DEFERRED pending a real
          browser check on both viewports — do not add `md:` pinning from a
          jsdom test, which loads no CSS and cannot tell any of these apart. */}
      <div
        className={cn(
          mode === 'thread' &&
            'fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-white px-4 pt-3 pb-3 md:static md:z-auto md:px-0 md:pb-0'
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
