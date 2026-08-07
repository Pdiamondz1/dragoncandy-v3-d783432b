// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandingCard } from './StandingCard';

const { mockEnabled } = vi.hoisted(() => ({ mockEnabled: vi.fn() }));
vi.mock('@/hooks/useDragonPoints', () => ({
  useDragonRewardsEnabled: () => mockEnabled(),
  useDragonPoints: () => ({ data: { balance: 1234, tier: 'scout' }, isLoading: false }),
}));
vi.mock('@/hooks/useDcPoints', () => ({
  useDcStanding: () => ({
    data: { role: 'business_client', balance: 350, tier: 'egg', campaignsCompleted: 1, avgRating: null },
    isLoading: false, isError: false,
  }),
  useDcLedger: () => ({ data: [], isLoading: false, isError: false }),
  useDcCatalog: () => ({
    data: {
      pointValues: { 'business.profile_completed': 200 },
      thresholds: {
        creator: [{ key: 'egg', min_dp: 0 }],
        business: [{ key: 'egg', min_dp: 0 }, { key: 'scout', min_dp: 500, min_campaigns: 3 }],
      },
    },
    isLoading: false, isError: false,
  }),
}));

describe('StandingCard', () => {
  beforeEach(() => mockEnabled.mockReset());

  it('states both unmet conditions for the next tier', () => {
    mockEnabled.mockReturnValue(true);
    render(<StandingCard />);
    expect(screen.getByText('350')).toBeInTheDocument();
    // Established needs 500 points and 3 campaigns; the user has 350 and 1.
    expect(screen.getByText(/150 more DC Points/i)).toBeInTheDocument();
    expect(screen.getByText(/2 more completed campaigns/i)).toBeInTheDocument();
  });

  it('never claims points buy anything', () => {
    mockEnabled.mockReturnValue(true);
    const { container } = render(<StandingCard />);
    expect(container.textContent).not.toMatch(/redeem|discount|cash out|coming soon/i);
  });
});
