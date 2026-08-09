// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DonnyHomeProposals } from './DonnyHomeProposals';
import type { DonnyProposal, DonnyProposalsResult } from '@/lib/donny/buildDonnyProposals';

function proposal(over: Partial<DonnyProposal> = {}): DonnyProposal {
  return {
    id: 'pending_action:review_application:c1',
    kind: 'pending_action',
    text: 'Ricky Ricardo applied to "Taco Tuesday"',
    occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    cta: { kind: 'route', label: 'Review application', route: '/dashboard/business/campaigns/c1' },
    priority: 0,
    dismissible: true,
    ...over,
  };
}

function result(over: Partial<DonnyProposalsResult> = {}): DonnyProposalsResult {
  return { blocker: null, proposals: [], overflowCount: 0, ...over };
}

const noop = () => {};

describe('DonnyHomeProposals', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(
      <DonnyHomeProposals result={result()} isLoading={false} onDismiss={noop} onTap={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeletons while loading, not a spinner', () => {
    render(
      <DonnyHomeProposals result={result()} isLoading onDismiss={noop} onTap={noop} />
    );
    expect(screen.getByTestId('donny-home-proposals-loading')).toBeInTheDocument();
  });

  it('renders a proposal with its relative time appended', () => {
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText(/Ricky Ricardo applied to "Taco Tuesday"/)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review application' })).toBeInTheDocument();
  });

  it('calls onTap with the proposal when the CTA is pressed', () => {
    const onTap = vi.fn();
    const p = proposal();
    render(
      <DonnyHomeProposals
        result={result({ proposals: [p] })}
        isLoading={false}
        onDismiss={noop}
        onTap={onTap}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review application' }));
    expect(onTap).toHaveBeenCalledWith(p);
  });

  it('renders text with no button when the CTA failed route validation', () => {
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal({ cta: null })] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText(/Ricky Ricardo applied/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review/ })).not.toBeInTheDocument();
  });

  it('offers dismiss only on dismissible proposals', () => {
    render(
      <DonnyHomeProposals
        result={result({
          proposals: [proposal(), proposal({ id: 'signal:deadline:c1', kind: 'signal', dismissible: false, occurredAt: null })],
        })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1);
  });

  it('calls onDismiss with the proposal id', () => {
    const onDismiss = vi.fn();
    render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()] })}
        isLoading={false}
        onDismiss={onDismiss}
        onTap={noop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('pending_action:review_application:c1');
  });

  it('renders the overflow line, pluralized', () => {
    const { rerender } = render(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()], overflowCount: 2 })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText('+ 2 more need your attention')).toBeInTheDocument();

    rerender(
      <DonnyHomeProposals
        result={result({ proposals: [proposal()], overflowCount: 1 })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    expect(screen.getByText('+ 1 more needs your attention')).toBeInTheDocument();
  });

  it('renders the blocker above the list even when the list is full', () => {
    const blocker = proposal({
      id: 'signal:location_setup',
      kind: 'signal',
      text: 'Hoboken needs a connected Stripe account before you can create campaigns, promotions, or use DragonShare',
      occurredAt: null,
      cta: { kind: 'route', label: 'Finish setup', route: '/dashboard/business/settings' },
      dismissible: false,
    });
    render(
      <DonnyHomeProposals
        result={result({ blocker, proposals: [proposal(), proposal({ id: 'x' }), proposal({ id: 'y' })] })}
        isLoading={false}
        onDismiss={noop}
        onTap={noop}
      />
    );
    const texts = screen.getAllByTestId('donny-proposal').map((el) => el.textContent ?? '');
    expect(texts[0]).toContain('Hoboken needs a connected Stripe account');
    expect(texts).toHaveLength(4);
  });
});
