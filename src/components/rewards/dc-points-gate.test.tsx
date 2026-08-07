// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StandingCard } from './StandingCard';
import { DcPointsChip } from './DcPointsChip';

const { mockEnabled, mockCatalog, mockLoading } = vi.hoisted(() => ({
  mockEnabled: vi.fn(),
  mockCatalog: vi.fn(),
  mockLoading: vi.fn(),
}));

const RESOLVED_CATALOG = {
  data: {
    pointValues: { 'business.profile_completed': 200 },
    thresholds: {
      creator: [{ key: 'egg', min_dp: 0 }],
      business: [{ key: 'egg', min_dp: 0 }, { key: 'scout', min_dp: 500, min_campaigns: 3 }],
    },
  },
  isLoading: false, isError: false,
};

vi.mock('@/hooks/useDragonPoints', () => ({
  useDragonRewardsEnabled: () => mockEnabled(),
  // Controllable per-test (default false, see the DcPointsChip beforeEach) so the
  // chip's loading-gate branch can be exercised without weakening the fixed
  // balance/tier the other tests assert against.
  useDragonPoints: () => ({ data: { balance: 1234, tier: 'scout' }, isLoading: mockLoading() }),
}));
vi.mock('@/hooks/useDcPoints', () => ({
  useDcStanding: () => ({
    data: { role: 'business_client', balance: 350, tier: 'egg', campaignsCompleted: 1, avgRating: null },
    isLoading: false, isError: false,
  }),
  useDcLedger: () => ({ data: [], isLoading: false, isError: false }),
  // Controllable per-test so we can exercise the catalog-not-resolved-yet branch
  // (Finding 1) without duplicating the whole mock module per test.
  useDcCatalog: () => mockCatalog(),
}));

describe('StandingCard', () => {
  beforeEach(() => {
    mockEnabled.mockReset();
    mockCatalog.mockReset();
    mockCatalog.mockReturnValue(RESOLVED_CATALOG);
  });

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
    expect(container.textContent).not.toMatch(
      /redeem|discount|cash out|coming soon|unlock|reward|perk|spend|convert/i,
    );
  });

  it('does not claim "top of the ladder" while the catalog has not resolved yet', () => {
    // On a cold load, useDcStanding and useDcCatalog are separate queries that
    // rarely settle in the same tick — standing here has resolved, but catalog
    // has not (isLoading: true, data: undefined). Until we actually have the
    // catalog we cannot know whether there is a next tier, so the component must
    // stay silent (or show a skeleton) rather than assert the user is maxed out.
    mockEnabled.mockReturnValue(true);
    mockCatalog.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<StandingCard />);
    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.queryByText(/top of the ladder/i)).not.toBeInTheDocument();
  });
});

const { mockRole } = vi.hoisted(() => ({ mockRole: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { role: mockRole() } }),
}));

describe('DcPointsChip', () => {
  beforeEach(() => {
    mockEnabled.mockReset();
    mockRole.mockReturnValue('business_client');
    mockLoading.mockReset();
    mockLoading.mockReturnValue(false);
  });

  it('renders nothing when the launch flag is OFF', () => {
    mockEnabled.mockReturnValue(false);
    const { container } = render(<DcPointsChip />, { wrapper: MemoryRouter });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the balance when the flag is ON', () => {
    mockEnabled.mockReturnValue(true);
    render(<DcPointsChip />, { wrapper: MemoryRouter });
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders nothing for a brand user (DRE has no brand triggers, so it would sit at 0)', () => {
    mockEnabled.mockReturnValue(true);
    mockRole.mockReturnValue('brand');
    const { container } = render(<DcPointsChip />, { wrapper: MemoryRouter });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the balance is still loading (avoids top-bar jitter)', () => {
    mockEnabled.mockReturnValue(true);
    mockLoading.mockReturnValue(true);
    const { container } = render(<DcPointsChip />, { wrapper: MemoryRouter });
    expect(container).toBeEmptyDOMElement();
  });
});
