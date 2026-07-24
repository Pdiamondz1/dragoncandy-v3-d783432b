import { DollarSign, Lock, Clock, Wallet } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import type { UserRole } from "@/lib/paymentEducation";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";

interface PaymentSummaryCardsProps {
  events: PaymentEvent[];
  userRole: UserRole;
  pendingReviewCount?: number;
  /** Creator wallet balance in CENTS (source of truth = creator_profiles.pending_balance × 100). */
  pendingBalanceCents?: number;
}

// A wallet→Stripe transfer (the shared flush) carries metadata.type ∈ these — the new #334 autoflush events
// AND legacy pre-#334 wallet withdrawals. A historical DIRECT collaboration transfer carries no such type.
// So earnings discriminate on metadata.type (not flush_id or entity_type, which can't tell them apart).
const WALLET_TRANSFER_TYPES = new Set(['wallet_withdrawal', 'pending_balance_autoflush']);

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Charge events (escrow_authorized/escrow_held) use the campaign id as
// entity_id while release events use the collaboration id, so cross-event
// matching must go through campaign_id as well.
function sameEntity(a: PaymentEvent, b: PaymentEvent): boolean {
  return a.entity_id === b.entity_id || (!!a.campaign_id && a.campaign_id === b.campaign_id);
}

// escrow_held is written without an amount by some flows; the matching
// escrow_authorized (latest one at or before the hold) carries the charge.
function resolveEscrowAmount(held: PaymentEvent, events: PaymentEvent[]): number {
  if (held.amount_cents != null) return held.amount_cents;
  const auths = events.filter(a =>
    a.event_type === 'escrow_authorized' &&
    a.amount_cents != null &&
    a.created_at <= held.created_at &&
    sameEntity(a, held)
  );
  return auths.length > 0 ? (auths[auths.length - 1].amount_cents ?? 0) : 0;
}

export function computeBusinessStats(events: PaymentEvent[]) {
  const heldEvents = events.filter(e => e.event_type === 'escrow_held');
  const totalSpent =
    heldEvents.reduce((sum, e) => sum + resolveEscrowAmount(e, events), 0) +
    events
      .filter(e => e.event_type === 'sponsorship_paid')
      .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const inEscrow = heldEvents
    .filter(e => !events.some(r =>
      (r.event_type === 'payment_released' || r.event_type === 'refund_completed') && sameEntity(r, e)
    ))
    .reduce((sum, e) => sum + resolveEscrowAmount(e, events), 0);
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalSpent, inEscrow, pendingReview };
}

export function computeCreatorStats(events: PaymentEvent[], pendingBalanceCents: number) {
  // Total Earned = Σ payout_pending_wallet (every payout now transits the wallet) + Σ collaboration
  // transfer_created that is NOT a wallet-level transfer (historical direct payouts). Each payout counts
  // exactly once; payment_released is an escrow-decrement signal only and is never summed. See spec §4.1.
  const totalEarned = events
    .filter(e =>
      e.event_type === 'payout_pending_wallet' ||
      (e.event_type === 'transfer_created' && !WALLET_TRANSFER_TYPES.has((e.metadata?.type as string) ?? '')))
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  // In Wallet is the wallet balance itself (creator_profiles.pending_balance), not event-derived — the
  // wallet→Stripe flush event is user-keyed and can't be matched against collaboration-keyed credits.
  const inWallet = pendingBalanceCents;
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalEarned, inWallet, pendingReview };
}

export function PaymentSummaryCards({ events, userRole, pendingReviewCount, pendingBalanceCents }: PaymentSummaryCardsProps) {
  if (userRole === 'business') {
    const { totalSpent, inEscrow, pendingReview } = computeBusinessStats(events);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spent" value={formatCurrency(totalSpent)} />
        <SummaryCard icon={Lock} label="In Escrow" value={formatCurrency(inEscrow)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReviewCount ?? pendingReview)} />
      </div>
    );
  }

  if (userRole === 'creator') {
    const { totalEarned, inWallet, pendingReview } = computeCreatorStats(events, pendingBalanceCents ?? 0);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Earned" value={formatCurrency(totalEarned)} />
        <SummaryCard icon={Wallet} label="In Wallet" value={formatCurrency(inWallet)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReviewCount ?? pendingReview)} />
      </div>
    );
  }

  // Brand — reuse business stats for now
  const { totalSpent, inEscrow, pendingReview } = computeBusinessStats(events);
  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryCard icon={DollarSign} label="Committed" value={formatCurrency(totalSpent)} />
      <SummaryCard icon={Lock} label="Paid Out" value={formatCurrency(totalSpent - inEscrow)} />
      <SummaryCard icon={Clock} label="Active" value={String(pendingReview)} />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <AppCard className="p-4 text-center">
      <Icon className="w-5 h-5 text-teal-400 mx-auto mb-1" />
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </AppCard>
  );
}
