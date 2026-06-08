// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useReadinessGateEnabled', () => ({ useReadinessGateEnabled: () => true }));
const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useTransactionReadiness', () => ({ useTransactionReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ReadinessGate } from './ReadinessGate';

function setReadiness(partial: any) {
  readiness.current = { status: 'ready', isReady: true, shouldBlock: false, missingStripe: false, missingSocial: false,
    stripe: { hasAccount: true, onboardingComplete: true, chargesEnabled: true, payoutsEnabled: true, platformPendingBalance: 0, previousAccountId: null },
    social: { hasActive: true, reconnectNeeded: [] }, refetch: async () => {}, ...partial };
}

describe('ReadinessGate', () => {
  it('renders children when ready', () => {
    setReadiness({});
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('renders children (fail-open) when shouldBlock is false even if not ready (loading)', () => {
    setReadiness({ status: 'loading', isReady: false, shouldBlock: false });
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('blocks (hides children, shows checklist) only when shouldBlock is true in hard mode', () => {
    setReadiness({ status: 'no_account', isReady: false, shouldBlock: true });
    const { queryByTestId, queryByRole } = render(<ReadinessGate role="creator" require={{ stripe: true }} mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeNull();
    expect(queryByRole('status')).toBeTruthy();
  });

  it('soft mode always renders children even when not ready', () => {
    setReadiness({ status: 'no_account', isReady: false, shouldBlock: true });
    const { queryByTestId } = render(<ReadinessGate role="creator" require={{ social: true }} mode="soft"><button data-testid="commit">Boost</button></ReadinessGate>);
    expect(queryByTestId('commit')).toBeTruthy();
  });
});
