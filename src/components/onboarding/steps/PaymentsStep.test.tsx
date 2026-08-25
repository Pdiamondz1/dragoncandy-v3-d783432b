// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/**
 * The whole point of this slide's fix is one prop. Without `returnPath`, the Connect link
 * returns to the role's SETTINGS page, so "Complete Setup" on step 5 of 5 hands the user to
 * Stripe and Stripe hands them out of onboarding — the wizard is abandoned and its final
 * slide is never reached. That is invisible in every other test: the component still
 * renders, nothing throws, and the failure only appears after a round trip through a third
 * party. So it is pinned here.
 */
const seen: Record<string, unknown>[] = [];
vi.mock('@/components/settings/StripeConnectSetup', () => ({
  StripeConnectSetup: (props: Record<string, unknown>) => {
    seen.push(props);
    return <div data-testid="connect" />;
  },
}));

import { PaymentsStep } from './PaymentsStep';

describe('PaymentsStep', () => {
  it('asks Stripe to return to the wizard, for both roles', () => {
    for (const role of ['content_creator', 'business_client'] as const) {
      seen.length = 0;
      render(<PaymentsStep role={role} />);
      expect(seen).toHaveLength(1);
      expect(seen[0].returnPath).toBe('/profile/setup');
    }
  });

  it('still maps the role through to the right Connect config', () => {
    seen.length = 0;
    render(<PaymentsStep role="content_creator" />);
    expect(seen[0].role).toBe('creator');
    seen.length = 0;
    render(<PaymentsStep role="business_client" />);
    expect(seen[0].role).toBe('business');
  });

  /**
   * The old copy told the user they would be dumped in settings. It was accurate then and
   * is false now; a stale apology is worse than none, because it teaches the user to expect
   * the broken behaviour.
   */
  it('no longer tells the user they will be sent to settings', () => {
    seen.length = 0;
    render(<PaymentsStep role="content_creator" />);
    expect(screen.queryByText(/returns you to your settings/i)).toBeNull();
    expect(screen.getByText(/brings you back here/i)).toBeInTheDocument();
  });
});
