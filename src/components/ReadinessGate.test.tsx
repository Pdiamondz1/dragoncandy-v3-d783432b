// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useReadinessGateEnabled', () => ({ useReadinessGateEnabled: () => true }));
const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ReadinessGate } from './ReadinessGate';

function setMissing(missing: any[], outstanding: any[] = missing) {
  readiness.current = {
    requirements: [], required: [], recommended: [], outstanding,
    missingFor: () => missing,
    isBlocked: () => missing.length > 0,
    dismiss: () => {},
  };
}

const stripeUnmet = {
  key: 'stripe', tier: 'required', label: 'Set up payments', why: 'So you get paid.',
  resolve: { route: '/dashboard/creator/settings?section=payments' },
  state: { status: 'unmet' },
};
const stripePending = { ...stripeUnmet, state: { status: 'pending', detail: 'Stripe is still verifying.' } };

describe('ReadinessGate', () => {
  it('renders children when nothing is missing', () => {
    setMissing([]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });

  /**
   * The gate keys off missingFor(action), not off outstanding — a role can
   * have outstanding requirements (e.g. a recommended one, or one this action
   * doesn't demand) that must not block an action that doesn't need them.
   */
  it('renders children when outstanding is non-empty but missingFor(action) is empty', () => {
    setMissing([], [stripeUnmet]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('blocks and shows the checklist card on a definitive unmet', () => {
    setMissing([stripeUnmet]);
    const { queryByTestId, queryByRole } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeNull();
    expect(queryByRole('status')).toBeTruthy();
  });

  it('shows the verifying copy — not the no-account copy — while Stripe is pending', () => {
    setMissing([stripePending]);
    const { getByRole } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(getByRole('status').textContent).toContain('being verified');
  });

  it('soft mode never hides children', () => {
    setMissing([stripeUnmet]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="soft"><button data-testid="commit">Boost</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });
});
