// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Imported as a type only — `React.ReactNode` inside a vi.mock factory would
// otherwise resolve to the UMD global, which TS rejects inside a module.
import type { ReactNode } from 'react';

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
const donnyState = {
  // Defaults to READY. A null conversation is the cold-load window, which the
  // queueing tests below opt into explicitly.
  conversation: { id: 'c1' } as { id: string } | null,
  messages: [] as unknown[],
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  profileMock.value = { full_name: 'Joe Castelo', role: 'business_client' };
  pendingMock.data = [];
  pendingMock.isLoading = false;
  pendingMock.isError = false;
  // Reset here rather than at the end of each test — a failing assertion skips
  // the trailing cleanup and leaks state into whatever runs next.
  donnyState.conversation = { id: 'c1' };
  donnyState.messages = [];
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

  it('renders the answer inline once there is one', () => {
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
    renderHome();

    const log = screen.getByRole('log', { name: 'Donny conversation' });
    expect(log).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 measured post/)).toBeInTheDocument();
    donnyState.messages = [];
  });

  it('shows the thread while a reply is still streaming', () => {
    donnyState.messages = [];
    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Based on 1 measu';
    renderHome();

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
  it('does not scroll the page when arriving with an existing conversation', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    donnyState.messages = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Yesterday I said this.',
        tool_calls: null,
        tool_result: null,
        rich_card: null,
        quick_actions: [],
        created_at: '2026-08-08T10:00:00.000Z',
      },
    ];
    renderHome();

    expect(screen.getByRole('log', { name: 'Donny conversation' })).toBeInTheDocument();
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
  it('does not swallow a follow-up typed while a reply is streaming', () => {
    donnyState.isStreaming = true;
    donnyState.streamingContent = 'Based on';
    renderHome();

    const input = screen.getByRole('textbox', { name: /ask donny/i }) as HTMLInputElement;
    expect(input).toBeDisabled();

    fireEvent.change(input, { target: { value: 'and what about TikTok?' } });
    fireEvent.submit(input.closest('form')!);

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(input.value).toBe('and what about TikTok?');
  });

  it('disables the suggestion chips while a reply is streaming', () => {
    donnyState.isStreaming = true;
    renderHome();

    // Same reason as the input: a chip tap mid-reply reaches sendMessage's
    // silent early return and does nothing, which reads as a broken button.
    expect(screen.getByRole('button', { name: BUSINESS_SUGGESTIONS[0].label })).toBeDisabled();
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
