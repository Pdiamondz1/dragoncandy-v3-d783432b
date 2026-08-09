// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DragonPointsCard } from './DragonPointsCard';
import { DragonTierBadge } from '@/components/badges/DragonTierBadge';

// DragonPointsCard is a <Link> (the balance is the way into /rewards), so it needs a Router.
const renderCard = () => render(<MemoryRouter><DragonPointsCard /></MemoryRouter>);

// Control the launch gate. Both components read it via useDragonRewardsEnabled (same module),
// and useDragonPoints is stubbed so the card needs no auth/supabase/QueryClient.
const { mockEnabled } = vi.hoisted(() => ({ mockEnabled: vi.fn() }));
vi.mock('@/hooks/useDragonPoints', () => ({
  useDragonRewardsEnabled: () => mockEnabled(),
  useDragonPoints: () => ({ data: { balance: 1234, tier: 'scout' }, isLoading: false }),
}));

describe('Dragon Rewards UI launch gate', () => {
  beforeEach(() => mockEnabled.mockReset());

  it('DragonPointsCard renders nothing when the flag is OFF', () => {
    mockEnabled.mockReturnValue(false);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('DragonPointsCard renders points + tier when the flag is ON', () => {
    mockEnabled.mockReturnValue(true);
    renderCard();
    expect(screen.getByText('DC Points')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByTitle(/DC Rewards tier/i)).toBeInTheDocument();
  });

  // The card showed a balance with nowhere to click — the same dead end as the
  // "+200 DC Points" bell. It must be a link to the page that explains it.
  it('DragonPointsCard links to /rewards', () => {
    mockEnabled.mockReturnValue(true);
    renderCard();
    expect(screen.getByRole('link', { name: /view your dc points/i }))
      .toHaveAttribute('href', '/rewards');
  });

  it('DragonTierBadge renders nothing when the flag is OFF (covers anon public profiles)', () => {
    mockEnabled.mockReturnValue(false);
    const { container } = render(<DragonTierBadge tier="scout" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('DragonTierBadge renders the tier when the flag is ON', () => {
    mockEnabled.mockReturnValue(true);
    render(<DragonTierBadge tier="scout" />);
    expect(screen.getByTitle(/DC Rewards tier/i)).toBeInTheDocument();
  });
});
