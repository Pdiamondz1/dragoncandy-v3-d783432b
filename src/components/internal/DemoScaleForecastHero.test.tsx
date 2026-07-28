// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoScaleForecastHero } from './DemoScaleForecastHero';

// Stub the forecast composition so the test is about the hero, not the network.
vi.mock('@/hooks/internal/useForecast', () => ({
  useForecast: () => ({
    model: {
      scenarios: [
        { label: '1M', dau: 1_000_000, registeredUsers: 4_000_000, totalCostUsd: 123456,
          revenueUsd: 17_880_000, marginPct: 0.98, costPerDauUsd: 0.12, computeTier: 'Custom',
          peakConcurrent: 80_000, dbBytes: 0, storageBytes: 0, measured: false } as never,
      ],
      coefficients: {} as never, notes: [],
    },
    isLoading: false, isError: false, businessSharePct: 20,
  }),
}));

afterEach(() => vi.unstubAllEnvs());

describe('DemoScaleForecastHero', () => {
  it('renders nothing when DEMO mode is off', () => {
    const { container } = render(<DemoScaleForecastHero />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the badged 1M projection hero when DEMO mode is on', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    render(<DemoScaleForecastHero />);
    expect(screen.getByText(/projected/i)).toBeInTheDocument();
    expect(screen.getByText(/1,000,000/)).toBeInTheDocument(); // DAU headline
  });
});
