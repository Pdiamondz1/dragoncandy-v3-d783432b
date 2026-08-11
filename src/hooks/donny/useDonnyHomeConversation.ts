import React from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import type { DonnyMessage, DonnyAvatarState } from '@/types/donny';
import type { UserRole } from '@/types/user';

export interface DonnyHomeConversation {
  ask: (text: string) => void;
  hasConversation: boolean;
  isBusy: boolean;
  historyUnavailable: boolean;
  composerRef: React.RefObject<HTMLDivElement>;
  thread: {
    messages: DonnyMessage[];
    avatarState: DonnyAvatarState;
    streamingContent: string;
    error: string | null;
    retry: () => void;
    userRole: UserRole;
  };
}

export function useDonnyHomeConversation(): DonnyHomeConversation {
  const {
    registerInlineConversation,
    conversation,
    messages,
    messagesLoaded,
    messagesErrored,
    retryLoadMessages,
    avatarState,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    retry,
    userRole,
  } = useDonnyContext();

  // Keep the conversation live while this page is mounted — without it the
  // messages query is disabled whenever the panel is closed, which is the
  // normal state here, and the thread below would render permanently empty.
  React.useEffect(() => registerInlineConversation(), [registerInlineConversation]);

  // An ask can land before there is a conversation to put it in. The prompt box
  // and the suggestions are live from first paint, but the conversation query
  // only starts once the effect above registers this surface, so a quick tap on
  // a cold load reaches useDonny with `conversation === null`.
  //
  // Sending into that gap does not just fail — it fails BADLY. useDonny throws
  // "No active conversation" on its first line, before it records
  // `lastUserMessage`, and retry() guards on that still-empty ref. So the error
  // renders a "Try Again" button that does nothing at all when clicked: a dead
  // control, the same class as the twelve dead /settings CTAs.
  //
  // So the ask is QUEUED rather than sent-and-caught. Nothing the user typed is
  // dropped, and there is no dead affordance to explain. Surfacing the error was
  // the first attempt and was not enough — the bar is whether the thing the user
  // did works, not whether the failure is visible. (Codex, rounds 1 and 2.)
  // The same slot also covers a send arriving while a reply is still streaming.
  // `useDonny.sendMessage` opens with `if (isSendingRef.current) return;` — a
  // SILENT return, no throw and no error — so an ask during that window simply
  // evaporates. The panel is safe because it passes `disabled={isStreaming}` to
  // its input; this surface had no such guard.
  const [queuedAsk, setQueuedAsk] = React.useState<string | null>(null);

  // "We don't need the conversation from yesterday. Every prompt is fresh upon
  // visit." (founder, 2026-08-10). Donny has ONE persistent conversation per
  // user, shared with the side panel, so this surface FILTERS it rather than
  // forking it: the panel stays a continuous chat and the model still receives
  // its history, but the dashboard shows only what was said here, this visit.
  //
  // The baseline is the id of the last message that existed when the user first
  // asked; the view is everything after it. Slicing by an ID — not a count, not
  // a wall-clock time — is what makes that robust. Late-arriving history lands
  // BEFORE the baseline in the ordered array and so stays excluded, and no
  // client clock is involved (a skewed one would hide the reply being waited
  // on).
  const [visitBaselineId, setVisitBaselineId] = React.useState<string | null | undefined>(
    undefined
  );

  // The ONE place a message actually leaves this page, and therefore the only
  // place the baseline is fixed. Both callers — the direct ask and the queue
  // flush — go through it, so the baseline is always recorded from a `messages`
  // array that has demonstrably loaded.
  //
  // Recording it in `ask()` instead was wrong in exactly the case the queue
  // exists for: on a cold load `messages` is `[]` (its query is
  // `enabled: !!conversation` and defaults to an empty array), so a quick tap
  // recorded the baseline as `null` — "this user has no history" — and when
  // yesterday's thread arrived a moment later, all of it counted as this visit
  // and rendered. An empty array cannot distinguish "no history" from "not
  // loaded yet"; only `messagesLoaded` can. (Codex.)
  const dispatch = React.useCallback(
    (text: string) => {
      // `undefined` means "not set yet", so later asks never move it — which is
      // what keeps one visit's exchanges together instead of the view resetting
      // to the newest question each time.
      setVisitBaselineId((prev) =>
        prev === undefined ? (messages[messages.length - 1]?.id ?? null) : prev
      );
      sendMessage(text);
    },
    [messages, sendMessage]
  );

  const visitMessages = React.useMemo(() => {
    // Nothing asked here yet — this visit's transcript is empty by definition.
    if (visitBaselineId === undefined) return [];
    // Asked with history loaded and genuinely empty: it is all this visit's.
    if (visitBaselineId === null) return messages;
    const cut = messages.findIndex((m) => m.id === visitBaselineId);
    return cut === -1 ? messages : messages.slice(cut + 1);
  }, [messages, visitBaselineId]);

  React.useEffect(() => {
    // Flush on `isStreaming`, not on `isBusy` — isBusy includes the queue
    // itself, so gating on it would deadlock the flush it is meant to trigger.
    if (!conversation || !messagesLoaded || isStreaming || queuedAsk === null) return;
    setQueuedAsk(null);
    dispatch(queuedAsk);
  }, [conversation, messagesLoaded, isStreaming, queuedAsk, dispatch]);

  // A queued ask counts as busy: the tap already happened, so the thread shows
  // the typing indicator instead of looking like nothing registered.
  const isBusy = isStreaming || queuedAsk !== null;
  // Has the owner asked something ON THIS PAGE, this visit? The baseline is set
  // by `dispatch` the instant a send goes out, and `queuedAsk` covers the window
  // before that where the send is waiting on the conversation or its history.
  //
  // This gate is why `isStreaming` and `error` are not enough on their own.
  // BOTH are global to the shared Donny state: ask in the side panel, navigate
  // here while the reply is still streaming, and `isBusy` is true with
  // `visitMessages` empty — so the page would collapse its greeting and render
  // someone else's in-flight answer as this visit's transcript. The same is true
  // of a stale `error` raised by a send that happened somewhere else. (Codex.)
  const askedHere = visitBaselineId !== undefined || queuedAsk !== null;

  // An ask is waiting on history that FAILED to load, so the wait will never
  // end on its own. Both obvious escapes are wrong: sending anyway takes a
  // baseline from an empty array and lets the whole conversation back in the
  // moment the query recovers, and waiting silently is a prompt that never
  // sends and never explains itself. So the page says so, and offers the retry
  // that actually fixes it.
  //
  // The queued ask is deliberately KEPT. A successful refetch flips
  // `messagesLoaded`, the flush effect drains the queue, and the question the
  // owner typed is sent without them retyping a word — the retry repairs the
  // cause, and the effect that was already waiting does the rest.
  const historyUnavailable = messagesErrored && queuedAsk !== null;
  const threadError = historyUnavailable
    ? "I couldn't load your conversation just now."
    : error;
  const threadRetry = historyUnavailable ? retryLoadMessages : retry;

  // Keyed on THIS VISIT's messages, so arriving with yesterday's thread in the
  // shared conversation leaves the page in its resting arrangement — greeting,
  // composer, taps — instead of opening on a conversation the owner did not
  // start.
  const hasConversation = askedHere && (visitMessages.length > 0 || isBusy || !!threadError);

  // Points at the composer, which in the conversation arrangement is the LAST
  // thing in the block — so bringing it into view brings the whole exchange
  // with it. `block: 'nearest'` is what makes this safe to fire on every token:
  // it scrolls the minimum needed and does nothing at all when the composer is
  // already on screen, which after the bounded-thread change it usually is.
  const composerRef = React.useRef<HTMLDivElement>(null);
  // The PAGE scroll follows the reply ONLY after the user has asked something
  // here. It deliberately does not fire on arrival: this is a dashboard, and
  // someone returning to it with yesterday's thread should land on the greeting
  // and the attention list, not be thrown down the page. (Scrolling the thread
  // REGION to its newest message is a different thing and always happens — it
  // lives in DonnyThreadRegion and cannot move the page.)
  //
  // The obvious heuristic — "the message count grew" — is wrong here, and was
  // the first version of this code. On arrival the count grows from 0 to N as
  // the query resolves, which is indistinguishable from a new reply, so
  // returning to the page scrolled past the greeting anyway. Worse, it depended
  // on React Query's cache: with the thread already cached the count never
  // grew and it behaved correctly, so it would have looked right about half the
  // time. Asking is something the user DOES — record it, don't infer it.
  const userAskedHere = React.useRef(false);

  React.useEffect(() => {
    if (!userAskedHere.current) return;
    // scrollIntoView, not a scrollTop write: the app's scroller is
    // #main-content, never the window (window.scrollY is always 0 here), and
    // letting the browser find the scrollable ancestor avoids hard-coding that.
    composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages.length, isBusy, streamingContent]);

  // Every path that sends from this page goes through here, so both the scroll
  // intent and the not-ready-yet queue are handled in exactly one place and
  // cannot drift between the prompt box, the taps and the attention list.
  const ask = React.useCallback(
    (text: string) => {
      userAskedHere.current = true;
      // One slot, last-wins. The window is a single round-trip; two asks inside
      // it means the user changed their mind, not that both should be sent.
      //
      // The `isStreaming` branch is a GUARD, not a live path: the prompt box and
      // the chips are disabled while busy, and `DonnyProposalCta`'s `kind: 'ask'`
      // variant — the only other caller — is declared in buildDonnyProposals.ts
      // and constructed nowhere in src/ today. Kept because it costs four lines
      // and the alternative is that whoever first ships an 'ask' proposal
      // silently reintroduces the dropped-message defect.
      //
      // `!messagesLoaded` is in the gate for a different reason than the rest
      // of it: sending would SUCCEED, but the baseline recorded alongside it
      // would be a lie. Queuing waits for the history the baseline has to be
      // measured against.
      if (!conversation || !messagesLoaded || isStreaming) {
        setQueuedAsk(text);
        return;
      }
      dispatch(text);
    },
    [conversation, messagesLoaded, isStreaming, dispatch]
  );

  return {
    ask,
    hasConversation,
    isBusy,
    historyUnavailable,
    composerRef,
    thread: {
      messages: visitMessages,   // THIS VISIT's messages, not the whole conversation
      avatarState,
      streamingContent,
      error: threadError,        // derived, not the raw context error
      retry: threadRetry,        // derived, not the raw context retry
      userRole,
    },
  };
}
