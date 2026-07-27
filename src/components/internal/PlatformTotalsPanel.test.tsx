// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformTotalsPanel } from './PlatformTotalsPanel';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

const withSynth: PlatformStats = {
  users: { total: 40, total_all: 2065, by_role: { content_creator: 17 }, by_role_all: { content_creator: 1007 } },
  businesses: { restaurants: 11, restaurants_all: 19, brands: 6, brands_all: 9, locations: 1796, locations_all: 1800 },
  campaigns: { total: 25, total_all: 52, by_status: {}, by_status_all: {} },
  dragonshare: { posts_total: 10, posts_total_all: 20, posts_by_status: {}, posts_by_status_all: {}, boosts_total: 7, boosts_total_all: 7 },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: { social_posts_logged: 14, social_posts_logged_all: 28, performance_tracked_posts: 6, performance_tracked_posts_all: 6 },
  social_connections: { total: 8, total_all: 10, by_platform: {}, by_platform_all: {} },
  generated_at: '2026-07-26T00:00:00Z',
};

// Every *_all equals its real count ⇒ no synthetic anywhere.
const noSynth: PlatformStats = {
  users: { total: 40, total_all: 40, by_role: {}, by_role_all: {} },
  businesses: { restaurants: 11, restaurants_all: 11, brands: 6, brands_all: 6, locations: 1796, locations_all: 1796 },
  campaigns: { total: 25, total_all: 25, by_status: {}, by_status_all: {} },
  dragonshare: { posts_total: 10, posts_total_all: 10, posts_by_status: {}, posts_by_status_all: {}, boosts_total: 7, boosts_total_all: 7 },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: { social_posts_logged: 14, social_posts_logged_all: 14, performance_tracked_posts: 6, performance_tracked_posts_all: 6 },
  social_connections: { total: 8, total_all: 8, by_platform: {}, by_platform_all: {} },
  generated_at: '2026-07-26T00:00:00Z',
};

describe('PlatformTotalsPanel', () => {
  it('renders the heading and all six headline cards', () => {
    render(<PlatformTotalsPanel stats={withSynth} />);
    expect(screen.getByText(/Platform totals/i)).toBeInTheDocument();
    for (const label of ['Total users', 'Businesses', 'Campaigns', 'DragonFeed posts', 'DragonShare boosts', 'Promotions']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the combined grand total and the real · simulated split', () => {
    render(<PlatformTotalsPanel stats={withSynth} />);
    expect(screen.getByText('2,065')).toBeInTheDocument(); // combined users
    expect(screen.getByText('40 real · 2,025 simulated')).toBeInTheDocument();
    expect(screen.getByText('17 real · 11 simulated')).toBeInTheDocument(); // businesses 19+9 vs 11+6
  });

  it('omits the per-card split when there is no synthetic data', () => {
    render(<PlatformTotalsPanel stats={noSynth} />);
    expect(screen.getByText('Total users')).toBeInTheDocument();
    // The caption always says "…real and simulated combined…"; only the per-card split reads "N simulated".
    expect(screen.queryByText(/\d+ simulated/)).not.toBeInTheDocument();
  });
});
