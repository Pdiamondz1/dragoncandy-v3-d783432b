// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { stubMatchMedia } from '@/test/stubMatchMedia';
import type { ReactNode } from 'react';

// DonnyHomePrompt's textarea branches on useIsMobile, which subscribes to
// window.matchMedia on mount; jsdom has none.
stubMatchMedia();

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({
    sendMessage: vi.fn(), registerInlineConversation: vi.fn(() => vi.fn()),
    retry: vi.fn(), retryLoadMessages: vi.fn(), openDonnyWithContext: vi.fn(),
    close: vi.fn(), avatarState: 'idle', userRole: 'content_creator',
    conversation: { id: 'c1' }, messages: [], messagesLoaded: true,
    messagesErrored: false, isStreaming: false, streamingContent: '', error: null,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { full_name: 'Ada', creator_name: 'Ada', role: 'content_creator' }, activeOrgUnit: null }),
}));
vi.mock('@/components/analytics/AnalyticsProvider', () => ({
  useAnalyticsContext: () => ({ trackEvent: vi.fn() }),
}));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useTour', () => ({
  useTour: () => ({ showTour: false, tourSteps: [], completeTour: vi.fn(), skipTour: vi.fn(), triggerTour: vi.fn() }),
}));
vi.mock('@/components/reviews/RatingPromptManager', () => ({
  RatingPromptManager: () => <div data-testid="rating-prompt" />,
}));

// The four creator hooks CreatorDonnyHome reads: one invitation and one
// collaboration, so item D and item A both render and the attention region is
// never empty — the anchor must be measurable, not merely present.
vi.mock('@/hooks/useCreatorAttentionInvitations', () => ({
  useCreatorAttentionInvitations: () => ({ data: [{ invitationId: 'i1', campaignId: 'c1', campaignTitle: 'Taco Tuesday', businessName: "Joe's Pizza", createdAt: '2026-08-02T14:00:00Z' }], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorContentTodo', () => ({
  useCreatorContentTodo: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorPendingApplications', () => ({
  useCreatorPendingApplications: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useCreatorPayoutState', () => ({
  useCreatorPayoutState: () => ({ data: { hasStripeAccount: false, onboardingComplete: false, pendingBalance: 0, collaborationCount: 1 }, isLoading: false, isError: false }),
}));

// CreatorOverview's own data hooks — all react-query based, so leaving any one
// unmocked throws "No QueryClient set" the instant it renders. None of them
// feed the anchors under test, so every mock returns an empty/idle shape.
vi.mock('@/hooks/useCreatorDashboardStats', () => ({
  useCreatorDashboardStats: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useCreatorRecentActivity', () => ({
  useCreatorRecentActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCreatorUpcomingDeadlines', () => ({
  useCreatorUpcomingDeadlines: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useDragonShare', () => ({
  useCreatorDragonShareEarnings: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/useCreatorDragonShareActivity', () => ({
  useCreatorDragonShareActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useDragonPoints', () => ({
  useDragonRewardsEnabled: () => false,
  useDragonPoints: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/useFeedOptIn', () => ({
  useFeedOptIn: () => ({ shouldPrompt: false, optIn: vi.fn(), isOptingIn: false, dismiss: vi.fn() }),
}));
vi.mock('@/hooks/useCreatorBriefPerformance', () => ({
  useCreatorBriefPerformance: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useResolveDragonShareOrgs', () => ({
  useResolveDragonShareOrgs: () => ({ data: [] }),
}));
// Hits Supabase directly via an inline useQuery (no exported hook to mock);
// render nothing, same reasoning as RatingPromptManager above.
vi.mock('@/components/outstand/UpcomingPostsWidget', () => ({
  UpcomingPostsWidget: () => null,
}));
// ContentIdeaCard renders RestaurantTypeahead, which unconditionally mounts
// RestaurantBrowseDialog, which calls useRestaurantBrowse (yet another
// unmocked useQuery) regardless of the dialog's open state — a two-hook-deep
// chain with nothing under test. Mocked at the card boundary rather than
// chasing each leaf hook; not a tour anchor.
vi.mock('@/components/donny/ContentIdeaCard', () => ({
  ContentIdeaCard: () => null,
}));

import { CreatorDonnyHome } from '@/components/donny/CreatorDonnyHome';
import CreatorOverview from '@/pages/CreatorOverview';
import { CREATOR_TOUR } from './role-tours';

const renderCreatorDonnyHome = () =>
  render(<MemoryRouter><CreatorDonnyHome /></MemoryRouter>);
const renderCreatorOverview = () =>
  render(<MemoryRouter><CreatorOverview /></MemoryRouter>);

// Chrome selectors are OUT OF SCOPE: donny-help lives in DonnyNavButton inside
// DashboardLayout, which these tests mock — asserting it would fail against a
// mock rather than a real regression. Same reasoning covers org-switcher and
// bottom-nav-add on the business side.
const CHROME = ["[data-tour='donny-help']"];

describe('CREATOR_TOUR anchors resolve on both creator pages', () => {
  it('every page-owned step is present on the Donny dashboard and the overview', () => {
    const bodySteps = CREATOR_TOUR.filter((s) => !CHROME.includes(s.target));
    expect(bodySteps.length).toBe(3);

    // Mount each page ONCE. Neither renders anything that varies per step, so
    // mounting inside the loop would be six full renders of two real page trees
    // to answer three static selector questions.
    const donnyHome = renderCreatorDonnyHome().container;
    const overview = renderCreatorOverview().container;

    for (const step of bodySteps) {
      expect(donnyHome.querySelector(step.target),
        `${step.target} missing from CreatorDonnyHome`).not.toBeNull();
      expect(overview.querySelector(step.target),
        `${step.target} missing from CreatorOverview`).not.toBeNull();
    }
  });
});
