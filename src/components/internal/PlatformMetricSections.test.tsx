// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformMetricSections } from './PlatformMetricSections';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

const base: PlatformStats = {
  users: { total: 40, total_all: 2065, by_role: { content_creator: 17 }, by_role_all: { content_creator: 1007 } },
  businesses: { restaurants: 11, restaurants_all: 19, brands: 6, brands_all: 9, locations: 1796, locations_all: 1800 },
  campaigns: { total: 25, total_all: 52, by_status: { active: 2 }, by_status_all: { active: 5 } },
  dragonshare: { posts_total: 10, posts_total_all: 20, posts_by_status: {}, posts_by_status_all: {}, boosts_total: 7, boosts_total_all: 7 },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: { social_posts_logged: 14, social_posts_logged_all: 28, performance_tracked_posts: 6, performance_tracked_posts_all: 6 },
  social_connections: { total: 8, total_all: 10, by_platform: {}, by_platform_all: {} },
  generated_at: '2026-07-26T00:00:00Z',
};

const zeroSynth: PlatformStats = {
  ...base,
  users: { total: 40, total_all: 40, by_role: { content_creator: 17 }, by_role_all: { content_creator: 17 } },
};

describe('PlatformMetricSections', () => {
  it('renders an error card on isError', () => {
    render(<PlatformMetricSections mode="synthetic" stats={undefined} isLoading={false} isError />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows the empty note in synthetic mode when there is no synthetic cohort', () => {
    render(<PlatformMetricSections mode="synthetic" stats={zeroSynth} isLoading={false} isError={false} />);
    expect(screen.getByText(/no synthetic cohort active/i)).toBeInTheDocument();
    expect(screen.queryByText('Users & businesses')).not.toBeInTheDocument();
  });

  it('renders the three section headings for real data', () => {
    render(<PlatformMetricSections mode="real" stats={base} isLoading={false} isError={false} />);
    expect(screen.getByText('Users & businesses')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Total users')).toBeInTheDocument();
  });

  it('renders synthetic values when there is a cohort', () => {
    render(<PlatformMetricSections mode="synthetic" stats={base} isLoading={false} isError={false} />);
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('shows a migration-needed state (not a false empty cohort) when total_all is absent', () => {
    const preMigration: PlatformStats = {
      ...base,
      users: { total: 40, by_role: { content_creator: 17 }, by_role_all: { content_creator: 17 } },
    };
    render(<PlatformMetricSections mode="synthetic" stats={preMigration} isLoading={false} isError={false} />);
    expect(screen.getByText(/totals migration/i)).toBeInTheDocument();
    expect(screen.queryByText(/no synthetic cohort active/i)).not.toBeInTheDocument();
  });
});
