// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stubMatchMedia } from '@/test/stubMatchMedia';
// Imported as a type only — `React.ReactNode` inside a vi.mock factory would
// otherwise resolve to the UMD global, which TS rejects inside a module.
import type { ReactNode } from 'react';

// DonnyHomePrompt's textarea branches on useIsMobile, which subscribes to
// window.matchMedia on mount; jsdom has none.
stubMatchMedia();

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// `openDonnyWithContext` is the OLD behaviour — it opens the side panel. It is
// still mocked so the tests below can assert it is NOT called: the founder's
// report was that asking on the dashboard threw the panel open instead of
// answering in place, and an assertion that only checks sendMessage would still
// pass if both fired.
const openDonnyWithContextMock = vi.fn();
const sendMessageMock = vi.fn();
const registerInlineConversationMock = vi.fn(() => vi.fn());
const retryLoadMessagesMock = vi.fn();
const donnyState = {
  // Defaults to READY. A null conversation is the cold-load window, which the
  // queueing tests below opt into explicitly.
  conversation: { id: 'c1' } as { id: string } | null,
  messages: [] as unknown[],
  // Defaults to READY, like `conversation`. The cold-load window — history
  // query still in flight, so `messages` is `[]` while a thread exists on the
  // server — is opted into explicitly by the race test below.
  messagesLoaded: true,
  messagesErrored: false,
  isStreaming: false,
  streamingContent: '',
  error: null as string | null,
};
vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    openDonnyWithContext: openDonnyWithContextMock,
    sendMessage: sendMessageMock,
    registerInlineConversation: registerInlineConversationMock,
    retry: vi.fn(),
    retryLoadMessages: retryLoadMessagesMock,
    avatarState: 'idle',
    userRole: 'business_client',
    close: vi.fn(),
    ...donnyState,
  }),
}));

const trackEventMock = vi.fn();
vi.mock('@/components/analytics/AnalyticsProvider', () => ({
  useAnalyticsContext: () => ({ trackEvent: trackEventMock }),
}));

const profileMock = { value: { full_name: 'Joe Castelo', role: 'business_client' } as { full_name: string | null; role: string } | null };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: profileMock.value, activeOrgUnit: { id: 'ou1' } }),
}));

const pendingMock = { data: [] as unknown[], isLoading: false, isError: false };
vi.mock('@/hooks/usePendingActions', () => ({
  usePendingActions: () => pendingMock,
}));

vi.mock('@/hooks/useUpcomingCampaignDeadlines', () => ({
  useUpcomingCampaignDeadlines: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/hooks/useLocationReadiness', () => ({
  useLocationReadiness: () => ({
    isReady: true,
    missingSocial: false,
    missingStripe: false,
    locationName: 'Hoboken',
    hasActiveLocation: true,
  }),
}));

vi.mock('@/hooks/useTour', () => ({
  useTour: () => ({
    showTour: false,
    tourSteps: [],
    completeTour: vi.fn(),
    skipTour: vi.fn(),
    triggerTour: vi.fn(),
  }),
}));

// Both hit Supabase directly; render nothing so this suite stays a unit test.
vi.mock('@/components/reviews/RatingPromptManager', () => ({
  RatingPromptManager: () => <div data-testid="rating-prompt" />,
}));
vi.mock('@/components/reviews/SponsorshipRatingPromptManager', () => ({
  SponsorshipRatingPromptManager: () => <div data-testid="sponsorship-rating-prompt" />,
}));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/org/LocationBadge', () => ({ LocationBadge: () => null }));

import { DonnyHome } from './DonnyHome';
import { BUSINESS_SUGGESTIONS } from '@/lib/donny/donnyHomeSuggestions';

function renderHome() {
  return render(
    <MemoryRouter>
      <DonnyHome />
    </MemoryRouter>
  );
}

/** Type into the composer and submit — the page shows only what was asked HERE. */
function askOnPage(text = 'plan my week') {
  const input = screen.getByRole('textbox', { name: /ask donny/i });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
}

/**
 * Ask on this page, THEN have the reply start streaming — the real sequence,
 * and the only one that works: the composer refuses to submit while `busy`, so
 * a test that sets `isStreaming` before asking cannot ask at all.
 *
 * It matters that the ask comes first. `isStreaming` and `error` are global to
 * the shared Donny state, so the page shows a thread only when the owner asked
 * HERE — a reply started in the side panel must not open one.
 */
function askThenStream(
  rerender: (ui: React.ReactElement) => void,
  streamingContent = 'Working on it'
) {
  askOnPage();
  donnyState.isStreaming = true;
  donnyState.streamingContent = streamingContent;
  rerender(
    <MemoryRouter>
      <DonnyHome />
    </MemoryRouter>
  );
}

/** A minimal assistant message — only the fields DonnyHome/DonnyThread read. */
function msg(id: string, content: string, created_at = '2026-08-09T23:24:00.000Z') {
  return {
    id,
    conversation_id: 'c1',
    role: 'assistant',
    content,
    tool_calls: null,
    tool_result: null,
    rich_card: null,
    quick_actions: [],
    created_at,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom implements no scrollIntoView at all, so the follow-the-reply effect
  // throws the moment a test asks something. Individual tests still install
  // their own spy when they need to assert on it; this is the floor so that a
  // test which merely asks does not have to care.
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  profileMock.value = { full_name: 'Joe Castelo', role: 'business_client' };
  pendingMock.data = [];
  pendingMock.isLoading = false;
  pendingMock.isError = false;
  // Reset here rather than at the end of each test — a failing assertion skips
  // the trailing cleanup and leaks state into whatever runs next.
  donnyState.conversation = { id: 'c1' };
  donnyState.messages = [];
  donnyState.messagesLoaded = true;
  donnyState.messagesErrored = false;
  donnyState.isStreaming = false;
  donnyState.streamingContent = '';
  donnyState.error = null;
});

describe('DonnyHome — greeting', () => {
  it('greets the owner by name', () => {
    renderHome();
    expect(screen.getByText(/Joe Castelo/)).toBeInTheDocument();
  });

  it('never prints "undefined" when there is no name', () => {
    profileMock.value = { full_name: null, role: 'business_client' };
    renderHome();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.getByText(/there/)).toBeInTheDocument();
  });

  it('shows a skeleton instead of greeting "there" while the profile has not loaded', () => {
    // BusinessOverview.tsx (the body this replaces) guards with an `!profile`
    // skeleton branch — without the same guard here, a logged-in owner would
    // flash "Welcome back, there" before their name loads.
    profileMock.value = null;
    const { container } = renderHome();
    expect(screen.queryByText(/there/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('DonnyHome — taps and prompt', () => {
  it('sends a tapped suggestion to Donny and records it', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: BUSINESS_SUGGESTIONS[0].label }));
    expect(sendMessageMock).toHaveBeenCalledWith(BUSINESS_SUGGESTIONS[0].message);
    expect(openDonnyWithContextMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_suggestion_tapped', {
        label: BUSINESS_SUGGESTIONS[0].label,
      })
    );
  });

  it('sends a typed prompt to Donny and records it', async () => {
    renderHome();
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'plan my week' } });
    fireEvent.submit(input.closest('form')!);
    expect(sendMessageMock).toHaveBeenCalledWith('plan my week');
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_prompt_submitted', {})
    );
  });

  // The reported defect, pinned directly: asking here must not throw the side
  // panel open. openDonnyWithContext is what does that — open() then expand()
  // then send.
  it('never opens the side panel — the answer belongs on this page', () => {
    renderHome();
    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'how are my instagram posts doing?' } });
    fireEvent.submit(input.closest('form')!);

    expect(openDonnyWithContextMock).not.toHaveBeenCalled();
  });

  // Without this registration the messages query stays disabled whenever the
  // panel is closed — which is the normal state on this page — and the thread
  // renders permanently empty. That is design-doc §13 hazard 5's real teeth.
  it('keeps the conversation live while the dashboard is mounted', () => {
    renderHome();
    expect(registerInlineConversationMock).toHaveBeenCalled();
  });
});

describe('DonnyHome — the conversation renders in the page', () => {
  it('shows no conversation area before anything has been asked', () => {
    donnyState.messages = [];
    donnyState.isStreaming = false;
    renderHome();

    // A first visit opens on the greeting and the attention list, not an empty
    // chat well.
    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
  });

  it('renders the answer inline once the user has asked here', () => {
    // Asks FIRST, because the page shows only this visit's exchange. Seeding
    // `messages` alone is a message from a previous visit and correctly renders
    // nothing — see the fresh-per-visit tests below.
    const { rerender } = renderHome();
    askOnPage('how are my instagram posts doing?');

    donnyState.messages = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Based on 1 measured post so far.',
        tool_calls: null,
        tool_result: null,
        rich_card: null,
        quick_actions: [],
        created_at: '2026-08-09T23:24:00.000Z',
      },
    ];
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    const log = screen.getByRole('log', { name: 'Donny conversation' });
    expect(log).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 measured post/)).toBeInTheDocument();
    donnyState.messages = [];
  });

  it('shows the thread while a reply is still streaming', () => {
    donnyState.messages = [];
    const { rerender } = renderHome();
    askThenStream(rerender, 'Based on 1 measu');

    expect(screen.getByRole('log', { name: 'Donny conversation' })).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 measu/)).toBeInTheDocument();
    donnyState.isStreaming = false;
    donnyState.streamingContent = '';
  });

  // Arriving on the dashboard must not throw the page to the bottom of an old
  // thread. The first version of this code inferred "a reply arrived" from the
  // message count growing — but on arrival the count grows 0 → N as the query
  // resolves, so it scrolled here too, and only *sometimes*: with the thread
  // already in the React Query cache the count never grew and it looked
  // correct. jsdom has no scrollIntoView, so it is stubbed rather than spied.
  it('arriving with an existing conversation shows nothing and scrolls nothing', () => {
    // Stronger than it used to be. This test previously asserted the thread
    // rendered but the page did not scroll to it; "every prompt is fresh upon
    // visit" means the thread is not there to scroll to at all.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    donnyState.messages = [msg('m1', 'Yesterday I said this.', '2026-08-08T10:00:00.000Z')];
    renderHome();

    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Yesterday I said this/)).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
    donnyState.messages = [];
  });

  // A send can fail before any message exists — tapping before the conversation
  // has loaded makes useDonny throw "No active conversation" without inserting
  // anything. Gating the thread on messages/streaming alone would leave that tap
  // doing nothing at all: no answer, no error, no retry.
  it('surfaces a send failure that produced no message', () => {
    donnyState.messages = [];
    donnyState.isStreaming = false;
    donnyState.error = 'No active conversation';
    renderHome();
    // The error belongs to a send made HERE; `error` is global state, so an
    // error raised by the side panel must not surface on this page.
    askOnPage();

    expect(screen.getByRole('log', { name: 'Donny conversation' })).toBeInTheDocument();
    expect(screen.getByText('No active conversation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    donnyState.error = null;
  });

  // The cold-load window: the prompt box is live before the conversation query
  // resolves. Sending into that gap throws "No active conversation" BEFORE
  // useDonny records lastUserMessage, so the resulting error's "Try Again" is a
  // button that does nothing. The ask is held instead of thrown away.
  it('holds an ask made before the conversation exists, then sends it', () => {
    donnyState.conversation = null;
    donnyState.messages = [];
    const { rerender } = renderHome();

    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'how are my instagram posts doing?' } });
    fireEvent.submit(input.closest('form')!);

    // Not sent — it would have thrown — but the tap is visibly acknowledged.
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(screen.getByRole('log', { name: 'Donny conversation' })).toBeInTheDocument();

    donnyState.conversation = { id: 'c1' };
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(sendMessageMock).toHaveBeenCalledWith('how are my instagram posts doing?');
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  // useDonny.sendMessage opens with `if (isSendingRef.current) return;` — a
  // SILENT return. DonnyHomePrompt cleared the box on submit regardless, so a
  // follow-up typed while Donny was still answering vanished with no trace. The
  // panel was never exposed to this: it passes disabled={isStreaming} to its
  // input. Asserting the text SURVIVES is the point — an assertion that
  // sendMessage was not called would pass even while the box emptied.
  //
  // The field itself is deliberately NOT disabled (founder decision, matching
  // ChatGPT): the owner composes their follow-up while the answer streams. It
  // is the SEND BUTTON that is disabled, and DonnyHomePrompt.submit() re-checks
  // `busy` so Enter cannot get past it either.
  it('does not swallow a follow-up typed while a reply is streaming', () => {
    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Based on';
    renderHome();

    const input = screen.getByRole('textbox', { name: /ask donny/i }) as HTMLTextAreaElement;
    expect(input).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /send to donny/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'and what about TikTok?' } });
    fireEvent.submit(input.closest('form')!);

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(input.value).toBe('and what about TikTok?');
  });

  it('retires the suggestion chips once a reply is streaming', () => {
    const { rerender } = renderHome();
    askThenStream(rerender);

    // Stronger than "disabled", which is what this asserted before the chips
    // became a cold-start-only affordance. They are gone, so a chip tap into
    // sendMessage's silent early return is unreachable rather than merely
    // discouraged — and the room they occupied goes to the thread.
    expect(
      screen.queryByRole('button', { name: BUSINESS_SUGGESTIONS[0].label })
    ).not.toBeInTheDocument();
  });

  it('follows the reply down the page once the user asks something here', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    donnyState.messages = [];
    const { rerender } = renderHome();

    const input = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(input, { target: { value: 'how are my instagram posts doing?' } });
    fireEvent.submit(input.closest('form')!);
    expect(sendMessageMock).toHaveBeenCalledWith('how are my instagram posts doing?');

    // Asking arms the scroll; the arriving reply is what actually triggers it.
    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Based on';
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(scrollIntoView).toHaveBeenCalled();
    donnyState.isStreaming = false;
    donnyState.streamingContent = '';
  });
});

// The founder, on prod: "On the Desktop the conversation just keep running down
// endlessly and there's no scroll button." The composer sat ABOVE the thread, so
// the newest message was the furthest thing from the box you type in.
//
// `compareDocumentPosition` is a real fact about the rendered tree, not a class
// string — it is the strongest thing jsdom can say here, because jsdom loads no
// CSS and does no layout, so nothing in this file can prove the box is actually
// bounded on screen. The height/overflow assertions below are CLASS-VALUE PINS
// and are labelled as such.
describe('DonnyHome — the composer moves under the conversation', () => {
  // These cases drive the conversation state with `isStreaming` rather than a
  // seeded message. Seeded messages are a PREVIOUS visit now, and the dashboard
  // deliberately shows nothing from one — so a fixture message would leave the
  // page in its resting arrangement and every assertion here would be about the
  // wrong layout.
  const composerForm = () => screen.getByRole('textbox', { name: /ask donny/i }).closest('form')!;
  const follows = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('puts the composer BELOW the conversation once there is one', () => {
    // Streaming, not seeded messages: the page shows only this visit's thread,
    // and a reply in flight is this visit by definition. Seeding `messages`
    // alone is a previous visit and renders nothing.
    const { rerender } = renderHome();
    askThenStream(rerender);

    expect(follows(screen.getByRole('log', { name: 'Donny conversation' }), composerForm())).toBe(
      true
    );
  });

  it('keeps the composer above the dashboard body while resting', () => {
    donnyState.messages = [];
    renderHome();

    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
    expect(follows(composerForm(), screen.getByText('Needs your attention'))).toBe(true);
  });

  it('bounds the conversation block once there is a conversation', () => {
    // CLASS-VALUE PINS. They pin the values that make the layout work; they do
    // not prove it works. `max-h`/`min-h` in dvh (never vh — the app document
    // never scrolls, so iOS toolbars never collapse and vh overshoots) live on
    // the BLOCK rather than the thread, so the composer's auto-grow eats into
    // the thread instead of pushing itself off screen.
    const { rerender } = renderHome();
    askThenStream(rerender);

    // scroller → DonnyThreadRegion's positioning wrapper → the block.
    const block = screen.getByRole('log', { name: 'Donny conversation' }).parentElement!
      .parentElement!;
    // 12rem, not 26rem: the hero collapses in exactly this state, so the
    // subtrahend no longer reserves room for an avatar and greeting that are
    // not rendered. Reserving it anyway would hand the reclaimed ~200px back as
    // whitespace and leave the thread the size it was.
    expect(block.className).toContain('max-h-[calc(100dvh-12rem)]');
    expect(block.className).toContain('min-h-[20rem]');
    expect(block.className).toContain('flex-col');
  });

  it('leaves the resting page unbounded — nothing about it changes', () => {
    donnyState.messages = [];
    const { container } = renderHome();
    expect(container.innerHTML).not.toContain('max-h-[calc(100dvh-12rem)]');
    expect(container.innerHTML).not.toContain('min-h-[20rem]');
  });

  it('keeps a half-typed follow-up when the first reply turns the page into a conversation', () => {
    // The composer changes POSITION between the two arrangements. If it also
    // changed identity it would remount, and whatever was being typed — plus
    // the focus that was in it — would vanish the instant Donny started
    // answering. Rendering the wrapper in both states keeps it at the same
    // child slot, so React reuses the element.
    donnyState.messages = [];
    const { rerender } = renderHome();

    askOnPage('the first question');
    const input = screen.getByRole('textbox', { name: /ask donny/i }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a follow-up in progress' } });

    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Working on it';
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(screen.getByRole('log', { name: 'Donny conversation' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /ask donny/i })).toHaveValue(
      'a follow-up in progress'
    );
  });
});

// Founder, after seeing the bounded thread on prod: "We don't need the
// conversation from yesterday. Every prompt is fresh upon visit." Donny keeps
// ONE conversation per user, shared with the side panel, so the dashboard
// filters it rather than forking it — the panel stays continuous and the model
// still receives history; only this surface's display is fresh.
describe('DonnyHome — every visit starts fresh', () => {
  it('shows nothing from a previous visit, on arrival', () => {
    donnyState.messages = [msg('old', 'Yesterday I said this.')];
    renderHome();

    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Yesterday I said this/)).not.toBeInTheDocument();
  });

  it('keeps yesterday out even after asking — only this visit is shown', () => {
    // The load-bearing one. A wrong baseline would let the whole prior thread
    // back in the moment the user typed anything.
    donnyState.messages = [msg('old', 'Yesterday I said this.')];
    const { rerender } = renderHome();

    askOnPage();
    donnyState.messages = [msg('old', 'Yesterday I said this.'), msg('new', 'Here is today.')];
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(screen.getByText(/Here is today/)).toBeInTheDocument();
    expect(screen.queryByText(/Yesterday I said this/)).not.toBeInTheDocument();
  });

  it('does not treat unloaded history as this visit when the owner asks immediately', () => {
    // The cold-load race (Codex). `messages` is `[]` while the history query is
    // in flight, so recording the baseline on tap would record "this user has
    // no history" — and the whole prior thread would then count as this visit's
    // and render the moment it arrived. The ask is queued instead, and the
    // baseline is taken when the send actually happens.
    donnyState.messagesLoaded = false;
    donnyState.messages = [];
    const { rerender } = renderHome();

    askOnPage();
    expect(sendMessageMock).not.toHaveBeenCalled();

    // History lands a moment later, exactly as it does on a cold dashboard.
    donnyState.messagesLoaded = true;
    donnyState.messages = [msg('old', 'Yesterday I said this.')];
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(sendMessageMock).toHaveBeenCalledWith('plan my week');
    expect(screen.queryByText(/Yesterday I said this/)).not.toBeInTheDocument();
  });

  it('ignores a reply that is streaming from another surface', () => {
    // `isStreaming` and `streamingContent` are GLOBAL to the shared Donny
    // state. Ask in the side panel, walk to the dashboard while it answers, and
    // without this gate the page collapses its greeting and renders someone
    // else's in-flight answer as this visit's transcript. (Codex.)
    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Answering something you asked in the panel';
    renderHome();

    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
    expect(screen.queryByText(/asked in the panel/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Welcome back/ })).toBeInTheDocument();
  });

  it('ignores an error raised by another surface', () => {
    donnyState.error = 'Something failed in the side panel';
    renderHome();

    expect(screen.queryByRole('log', { name: 'Donny conversation' })).not.toBeInTheDocument();
    expect(screen.queryByText(/failed in the side panel/)).not.toBeInTheDocument();
  });

  it('says so, and offers a working retry, when the history cannot be loaded', () => {
    // The third option. Sending anyway takes a baseline from an empty array and
    // lets the whole conversation back in when the query recovers (Codex, on my
    // own fix for the deadlock); waiting silently is a prompt that never sends.
    // So: say it, and offer the retry that repairs the cause.
    donnyState.messagesLoaded = false;
    donnyState.messagesErrored = true;
    renderHome();

    askOnPage();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't load your conversation/i)).toBeInTheDocument();

    const tryAgain = screen.getByRole('button', { name: 'Try Again' });
    fireEvent.click(tryAgain);
    expect(retryLoadMessagesMock).toHaveBeenCalled();
  });

  it('sends the waiting question itself once the history recovers', () => {
    // The queued ask is KEPT across the failure, so a successful refetch drains
    // it without the owner retyping a word.
    donnyState.messagesLoaded = false;
    donnyState.messagesErrored = true;
    const { rerender } = renderHome();
    askOnPage('what should I post this week?');

    donnyState.messagesErrored = false;
    donnyState.messagesLoaded = true;
    donnyState.messages = [msg('old', 'Yesterday I said this.')];
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );

    expect(sendMessageMock).toHaveBeenCalledWith('what should I post this week?');
    // And the recovered history is still history — not this visit's.
    expect(screen.queryByText(/Yesterday I said this/)).not.toBeInTheDocument();
  });

  it('collapses the greeting once the conversation starts, and restores it when resting', () => {
    // ~200px of avatar + greeting + subtitle, which on a phone is the
    // difference between a readable thread and a letterbox. The label row and
    // the dashboard body survive in both states.
    const cold = renderHome();
    expect(screen.getByRole('heading', { name: /Welcome back/ })).toBeInTheDocument();
    expect(screen.getByText('Restaurant Dashboard')).toBeInTheDocument();
    cold.unmount();

    const warm = renderHome();
    askThenStream(warm.rerender);
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument();
    expect(screen.getByText('Restaurant Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Needs your attention')).toBeInTheDocument();
  });
});

describe('DonnyHome — proposals', () => {
  const action = {
    sourceId: 'app1',
    campaignId: 'c1',
    campaignTitle: 'Taco Tuesday',
    actionType: 'review_application' as const,
    creatorName: 'Ricky Ricardo',
    occurredAt: new Date(Date.now() - 7_200_000).toISOString(),
  };

  it('renders a pending action and navigates on tap', async () => {
    pendingMock.data = [action];
    renderHome();
    const cta = screen.getByRole('button', { name: 'Review application' });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/business/campaigns/c1');
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_proposal_tapped', {
        proposal_kind: 'pending_action',
        cta_kind: 'route',
      })
    );
  });

  it('hides a dismissed proposal and remembers it', async () => {
    pendingMock.data = [action];
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText(/Ricky Ricardo applied/)).not.toBeInTheDocument()
    );
    expect(
      localStorage.getItem('donnyProposalDismissed_pending_action:review_application:c1:app1')
    ).toBeTruthy();
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_proposal_dismissed', {
        proposal_kind: 'pending_action',
      })
    );
  });
});

describe('DonnyHome — dismissal below the cap', () => {
  // Regression for the two-pass dismissal-read bug: pass 1 used to read
  // localStorage only for the CAPPED (top-3) candidate ids, so a live
  // dismissal on a proposal ranked 4th+ was never read. Dismissing a
  // higher-ranked proposal then promoted the already-dismissed one back into
  // view — dismissing one row resurrected another.
  const fiveActions = [1, 2, 3, 4, 5].map((n) => ({
    sourceId: `app${n}`,
    campaignId: `c${n}`,
    campaignTitle: `Campaign ${n}`,
    actionType: 'review_application' as const,
    creatorName: 'Ricky Ricardo',
    occurredAt: new Date(Date.now() - n * 3_600_000).toISOString(),
  }));

  it('does not resurrect a proposal ranked below the cap that was already dismissed', async () => {
    pendingMock.data = fiveActions;
    // Pre-seed a live (within-TTL) dismissal for the 4th-ranked proposal.
    // Ranked below PROPOSAL_CAP=3, so it is not visible yet either way — the
    // bug only surfaces once a higher-ranked proposal is dismissed and this
    // one would be promoted into the visible top 3.
    localStorage.setItem(
      'donnyProposalDismissed_pending_action:review_application:c4:app4',
      new Date().toISOString()
    );
    renderHome();

    // Dismiss the 1st-ranked (visible) proposal, promoting what was ranked
    // 4th into the visible top 3.
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => expect(screen.queryByText(/Campaign 1/)).not.toBeInTheDocument());
    // Campaign 4's dismissal predates this render — it must stay hidden, not
    // reappear just because it fell outside the capped candidate set.
    expect(screen.queryByText(/Campaign 4/)).not.toBeInTheDocument();
  });
});

describe('DonnyHome — page-level behaviour', () => {
  it('records the view exactly once, even across re-renders', async () => {
    const { rerender } = renderHome();
    rerender(
      <MemoryRouter>
        <DonnyHome />
      </MemoryRouter>
    );
    await waitFor(() => {
      const views = trackEventMock.mock.calls.filter((c) => c[0] === 'donny_home_viewed');
      expect(views).toHaveLength(1);
      expect(views[0][1]).toMatchObject({ role: 'business_client', has_pending: false });
    });
  });

  it('keeps the rating prompts INSIDE the attention frame, not beside it', () => {
    // Containment, not mere presence: getByTestId alone would pass whether
    // these are children of DonnyHomeProposals or siblings beside it — and
    // children-vs-siblings is the one structural requirement that has already
    // been caught as a defect once in this plan. NeedsAttentionSection wraps
    // each child in a `[data-attention-slot]` div, so an ancestor query
    // proves containment; a second, orphaned frame would show up as a second
    // "Needs your attention" heading.
    renderHome();
    const ratingPrompt = screen.getByTestId('rating-prompt');
    const sponsorshipPrompt = screen.getByTestId('sponsorship-rating-prompt');
    expect(ratingPrompt.closest('[data-attention-slot]')).not.toBeNull();
    expect(sponsorshipPrompt.closest('[data-attention-slot]')).not.toBeNull();
    expect(screen.getAllByText('Needs your attention')).toHaveLength(1);
  });

  it('links to the full dashboard and records it', async () => {
    renderHome();
    const link = screen.getByRole('link', { name: /view full dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard/business/overview');
    fireEvent.click(link);
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_overview_opened', {})
    );
  });

  it('keeps the tour replay button', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /show tour/i })).toBeInTheDocument();
  });

  it('renders the prompt and taps even with nothing else to say', () => {
    renderHome();
    expect(screen.getByRole('textbox', { name: /ask donny/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Create a campaign|Find creators|trending/ }).length).toBeGreaterThan(0);
  });
});
