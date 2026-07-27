// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mocks are created via vi.hoisted so they're available inside the (also-hoisted) vi.mock factories.
const mockUseInternalAccess = vi.hoisted(() => vi.fn());
const mockUsePlatformStats = vi.hoisted(() => vi.fn());
const mockUsePlatformWeight = vi.hoisted(() => vi.fn());
const mockUseScorecardBurn = vi.hoisted(() => vi.fn());
const mockUseScorecardHeadline = vi.hoisted(() => vi.fn());
const mockUseScorecardBurnCeilingCents = vi.hoisted(() => vi.fn());
const mockUseUpdateScorecardHeadline = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/internal/useInternalAccess', () => ({ useInternalAccess: mockUseInternalAccess }));
vi.mock('@/hooks/internal/usePlatformStats', () => ({ usePlatformStats: mockUsePlatformStats }));
vi.mock('@/hooks/internal/usePlatformWeight', () => ({ usePlatformWeight: mockUsePlatformWeight }));
vi.mock('@/hooks/internal/useScorecardBurn', () => ({ useScorecardBurn: mockUseScorecardBurn }));
vi.mock('@/hooks/internal/useScorecardSettings', () => ({
  useScorecardHeadline: mockUseScorecardHeadline,
  useScorecardBurnCeilingCents: mockUseScorecardBurnCeilingCents,
  useUpdateScorecardHeadline: mockUseUpdateScorecardHeadline,
}));

import InternalScorecard from './InternalScorecard';

const PLATFORM_DATA = {
  users: { total: 40, total_all: 2065, by_role: { content_creator: 17 }, by_role_all: { content_creator: 1200 } },
  businesses: { restaurants: 14, restaurants_all: 900, brands: 3, brands_all: 10, locations: 14, locations_all: 900 },
  campaigns: { total: 25, total_all: 500, by_status: {} },
  dragonshare: { posts_total: 10, posts_total_all: 100, posts_by_status: {}, boosts_total: 2, boosts_total_all: 20 },
  promotions: { total: 1, total_all: 1, by_status: {} },
  content: {
    social_posts_logged: 0, social_posts_logged_all: 0,
    performance_tracked_posts: 0, performance_tracked_posts_all: 0,
  },
  social_connections: { total: 0, total_all: 0, by_platform: {} },
  generated_at: '2026-07-26T00:00:00Z',
};

// net_burn_cents 40200 -> "$402" headline in the efficiency card (see scorecardModel.test.ts).
const BURN_DATA = { monthly_opex_cents: 39000, mtd_ai_spend_usd: 12, mtd_revenue_cents: 0, net_burn_cents: 40200 };

function setupMocks(isAdmin: boolean) {
  mockUseInternalAccess.mockReturnValue({ isAdmin, isStakeholder: !isAdmin, isLoading: false });
  mockUsePlatformStats.mockReturnValue({ data: PLATFORM_DATA, isLoading: false, isError: false });
  mockUsePlatformWeight.mockReturnValue({ data: [], isLoading: false, isError: false });
  mockUseScorecardBurn.mockReturnValue({ data: BURN_DATA, isLoading: false, isError: false });
  mockUseScorecardHeadline.mockReturnValue({
    data: 'Pre-revenue by design — building the marketplace',
    isLoading: false,
    isError: false,
  });
  mockUseScorecardBurnCeilingCents.mockReturnValue({ data: 40000, isLoading: false, isError: false });
  mockUseUpdateScorecardHeadline.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
}

const STORY_TITLES = ['Traction', 'Capital efficiency', 'Scale headroom', 'Revenue readiness'];

describe('InternalScorecard — admin', () => {
  it('renders all four stories, the burn dollar figure, and the export button', () => {
    setupMocks(true);
    render(<InternalScorecard />);

    for (const title of STORY_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText(/\$402/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export snapshot' })).toBeInTheDocument();
  });
});

describe('InternalScorecard — non-admin', () => {
  it('renders all four stories and the burn figure, but no export button', () => {
    setupMocks(false);
    render(<InternalScorecard />);

    for (const title of STORY_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText(/\$402/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export snapshot' })).not.toBeInTheDocument();
  });
});
