// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoScaleBanner } from './DemoScaleBanner';

afterEach(() => vi.unstubAllEnvs());

describe('DemoScaleBanner', () => {
  it('renders nothing when DEMO mode is off', () => {
    const { container } = render(<DemoScaleBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the DEMO banner when DEMO mode is on (non-prod project)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    render(<DemoScaleBanner />);
    expect(screen.getByText(/projected 1,000,000 dau/i)).toBeInTheDocument();
  });
});
