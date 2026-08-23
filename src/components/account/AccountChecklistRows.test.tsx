// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { AccountChecklistRows } from './AccountChecklistRows';

function req(key: string, status: string, tier = 'required') {
  return { key, tier, label: `Do ${key}`, why: `Because ${key}`,
    resolve: { route: `/x/${key}` }, state: { status } };
}
function setOutstanding(outstanding: any[]) {
  readiness.current = {
    requirements: outstanding, required: [], recommended: [],
    outstanding, missingFor: () => [], isBlocked: () => false, dismiss: vi.fn(),
  };
}

describe('AccountChecklistRows', () => {
  /**
   * NeedsAttentionSection hides itself via CSS :has() only when its slots are
   * genuinely EMPTY. A child rendering an empty container resurrects the header
   * around a blank frame — the documented failure mode. `unknown` never reaches
   * `outstanding` (it is excluded by construction upstream in
   * computeAccountReadiness), so there is no separate "everything is unknown"
   * case to test here distinct from "nothing outstanding" — both are just an
   * empty `outstanding` array reaching this component.
   */
  it('renders exactly null when nothing is outstanding', () => {
    setOutstanding([]);
    const { container } = render(<AccountChecklistRows role="business_client" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a row per outstanding requirement', () => {
    setOutstanding([req('stripe', 'unmet'), req('address', 'unmet')]);
    const { getByText } = render(<AccountChecklistRows role="business_client" />);
    expect(getByText('Do stripe')).toBeTruthy();
    expect(getByText('Do address')).toBeTruthy();
  });

  it('offers dismiss on recommended rows only', () => {
    setOutstanding([req('stripe', 'unmet', 'required'), req('team', 'unmet', 'recommended')]);
    const { getAllByRole } = render(<AccountChecklistRows role="business_client" />);
    const dismissButtons = getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.startsWith('Dismiss'));
    expect(dismissButtons).toHaveLength(1);
  });
});
