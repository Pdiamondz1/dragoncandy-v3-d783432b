// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Imported as a type only — `React.ReactNode` inside a vi.mock factory would
// otherwise resolve to the UMD global, which TS rejects inside a module.
import type { ReactNode } from 'react';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const openDonnyWithContextMock = vi.fn();
const sendMessageMock = vi.fn();
const setInlineMock = vi.fn();
vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    openDonnyWithContext: openDonnyWithContextMock,
    sendMessage: sendMessageMock,
    setInline: setInlineMock,
    exitInline: () => {},
    registerInlineComposer: () => {},
    focusInlineComposer: () => {},
    markAllRead: () => {},
    stage: 'inline',
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    retry: () => {},
  }),
}));

const trackEventMock = vi.fn();
vi.mock('@/components/analytics/AnalyticsProvider', () => ({
  useAnalyticsContext: () => ({ trackEvent: trackEventMock }),
}));

// Delegates to the real buildDonnyProposals by default — every existing test
// keeps exercising the genuine pure function through pendingMock/etc. Setting
// `.value` lets one test hand DonnyHome a proposal shape (an 'ask' cta) that
// no real input currently produces, without touching production code.
const proposalsOverrideMock: { value: DonnyProposalsResult | null } = { value: null };
vi.mock('@/lib/donny/buildDonnyProposals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/donny/buildDonnyProposals')>();
  return {
    ...actual,
    buildDonnyProposals: (input: Parameters<typeof actual.buildDonnyProposals>[0]) =>
      proposalsOverrideMock.value ?? actual.buildDonnyProposals(input),
  };
});

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
  proposalsOverrideMock.value = null;
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
    expect(openDonnyWithContextMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_prompt_submitted', {})
    );
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

  it('sends an "ask" CTA proposal to Donny instead of navigating or opening the panel', async () => {
    // No real input currently produces an 'ask' cta (buildDonnyProposals only
    // ever emits 'route' — see its file), but the type permits one and
    // handleProposalTap's non-route branch is real, changed code: it used to
    // call openDonnyWithContext and now calls sendMessage. Handed to DonnyHome
    // via proposalsOverrideMock rather than through pendingMock, since the
    // real pipeline can't produce this shape.
    const askProposal: DonnyProposal = {
      id: 'signal:ask_example',
      kind: 'signal',
      text: 'Ricky Ricardo asked a question about "Taco Tuesday"',
      occurredAt: null,
      cta: { kind: 'ask', label: 'Reply to Ricky', message: 'Draft a reply to Ricky Ricardo' },
      priority: 0,
      dismissible: false,
    };
    proposalsOverrideMock.value = {
      blocker: null,
      proposals: [askProposal],
      overflowCount: 0,
      allProposalIds: [askProposal.id],
    };
    renderHome();
    const cta = screen.getByRole('button', { name: 'Reply to Ricky' });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(sendMessageMock).toHaveBeenCalledWith('Draft a reply to Ricky Ricardo');
    expect(openDonnyWithContextMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith('donny_home_proposal_tapped', {
        proposal_kind: 'signal',
        cta_kind: 'ask',
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
