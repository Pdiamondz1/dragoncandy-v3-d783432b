// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { computeCreatorStats, computeBusinessStats, PaymentSummaryCards } from './PaymentSummaryCards';
import type { PaymentEvent } from '@/hooks/usePaymentTimeline';

let seq = 0;
const mk = (o: Partial<PaymentEvent>): PaymentEvent => ({
  id: `evt-${seq++}`,
  event_type: 'x',
  entity_type: 'collaboration',
  entity_id: 'c1',
  campaign_id: 'camp1',
  actor_id: null,
  actor_role: 'system',
  amount_cents: null,
  currency: 'usd',
  stripe_id: null,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  ...o,
});

// The reconciled Total-Earned rule (spec §4.1): Σ payout_pending_wallet + Σ (collaboration transfer_created
// whose metadata.type is NOT a wallet-level transfer). Each payout counts exactly once across historical
// transfer-path, historical pending-path, and new rerouted events.
describe('computeCreatorStats — reconciled Total Earned', () => {
  const events: PaymentEvent[] = [
    // historical transfer-path payout: collaboration-keyed transfer_created, metadata.destination, NO type → counts
    mk({ event_type: 'transfer_created', entity_id: 'collabA', amount_cents: 5000, metadata: { destination: 'acct_x' } }),
    // historical pending-path payout: payout_pending_wallet → counts
    mk({ event_type: 'payout_pending_wallet', entity_id: 'collabB', amount_cents: 3000 }),
    // NEW rerouted payout: payment_released + payout_pending_wallet (collaboration) + user-keyed flush transfer → counts ONCE
    mk({ event_type: 'payment_released', entity_id: 'collabC', amount_cents: 8000 }),
    mk({ event_type: 'payout_pending_wallet', entity_id: 'collabC', amount_cents: 8000 }),
    mk({ event_type: 'transfer_created', entity_id: 'userX', amount_cents: 8000, metadata: { type: 'pending_balance_autoflush', flush_id: 'f1' } }),
    // legacy manual wallet withdrawal: transfer_created type=wallet_withdrawal (no flush_id) → EXCLUDED
    mk({ event_type: 'transfer_created', entity_id: 'userX', amount_cents: 2000, metadata: { type: 'wallet_withdrawal' } }),
  ];

  it('counts each payout once; excludes wallet-level transfers and never sums payment_released', () => {
    const { totalEarned } = computeCreatorStats(events, 0);
    expect(totalEarned).toBe(5000 + 3000 + 8000); // 16000
  });

  it('inWallet is the pendingBalanceCents prop, not event-derived', () => {
    expect(computeCreatorStats(events, 4200).inWallet).toBe(4200);
    expect(computeCreatorStats(events, 0).inWallet).toBe(0);
  });
});

describe('computeBusinessStats — In Escrow decremented on every payout', () => {
  it('a matching payment_released (via campaign_id) decrements In Escrow; without it, still held', () => {
    const held = mk({ event_type: 'escrow_held', entity_id: 'camp1', campaign_id: 'camp1', amount_cents: 10000 });
    const released = mk({ event_type: 'payment_released', entity_id: 'collabZ', campaign_id: 'camp1', amount_cents: 8000 });
    expect(computeBusinessStats([held]).inEscrow).toBe(10000);
    expect(computeBusinessStats([held, released]).inEscrow).toBe(0);
  });
});

describe('PaymentSummaryCards render (creator)', () => {
  it('renders Total Earned from the reconciled rule and In Wallet from the prop', () => {
    const events: PaymentEvent[] = [
      mk({ event_type: 'payout_pending_wallet', entity_id: 'collabC', amount_cents: 16000 }),
      mk({ event_type: 'transfer_created', entity_id: 'userX', amount_cents: 16000, metadata: { type: 'pending_balance_autoflush' } }),
    ];
    render(<PaymentSummaryCards events={events} userRole="creator" pendingBalanceCents={4200} />);
    expect(screen.getByText('Total Earned')).toBeInTheDocument();
    expect(screen.getByText('$160.00')).toBeInTheDocument(); // 16000 cents, counted once (flush excluded)
    expect(screen.getByText('In Wallet')).toBeInTheDocument();
    expect(screen.getByText('$42.00')).toBeInTheDocument(); // pendingBalanceCents prop
  });
});
