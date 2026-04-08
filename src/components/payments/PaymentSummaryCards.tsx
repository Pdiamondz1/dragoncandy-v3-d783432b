import { DollarSign, Lock, Clock, Wallet } from "lucide-react";
import type { UserRole } from "@/lib/paymentEducation";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";

interface PaymentSummaryCardsProps {
  events: PaymentEvent[];
  userRole: UserRole;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function computeBusinessStats(events: PaymentEvent[]) {
  const totalSpent = events
    .filter(e => e.event_type === 'escrow_held' || e.event_type === 'sponsorship_paid')
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const inEscrow = events
    .filter(e => e.event_type === 'escrow_held')
    .filter(e => !events.some(r => r.entity_id === e.entity_id && (r.event_type === 'payment_released' || r.event_type === 'refund_completed')))
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalSpent, inEscrow, pendingReview };
}

function computeCreatorStats(events: PaymentEvent[]) {
  const totalEarned = events
    .filter(e => e.event_type === 'transfer_created' || e.event_type === 'payout_pending_wallet')
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const inWallet = events
    .filter(e => e.event_type === 'payout_pending_wallet')
    .filter(e => !events.some(w => w.entity_id === e.entity_id && w.event_type === 'transfer_created' && w.metadata?.type === 'wallet_withdrawal'))
    .reduce((sum, e) => sum + (e.amount_cents ?? 0), 0);
  const pendingReview = events
    .filter(e => e.event_type === 'content_submitted')
    .filter(e => !events.some(a => a.entity_id === e.entity_id && a.event_type === 'content_approved'))
    .length;
  return { totalEarned, inWallet, pendingReview };
}

export function PaymentSummaryCards({ events, userRole }: PaymentSummaryCardsProps) {
  if (userRole === 'business') {
    const { totalSpent, inEscrow, pendingReview } = computeBusinessStats(events);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spent" value={formatCurrency(totalSpent)} />
        <SummaryCard icon={Lock} label="In Escrow" value={formatCurrency(inEscrow)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReview)} />
      </div>
    );
  }

  if (userRole === 'creator') {
    const { totalEarned, inWallet, pendingReview } = computeCreatorStats(events);
    return (
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={DollarSign} label="Total Earned" value={formatCurrency(totalEarned)} />
        <SummaryCard icon={Wallet} label="In Wallet" value={formatCurrency(inWallet)} />
        <SummaryCard icon={Clock} label="Pending Review" value={String(pendingReview)} />
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
    <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
      <Icon className="w-5 h-5 text-teal-400 mx-auto mb-1" />
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
