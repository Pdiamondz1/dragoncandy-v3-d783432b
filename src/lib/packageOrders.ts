import type { CreatorOrder } from '@/types/packages';

// Creator-facing read of an order's state: one label + a colour tone + whether the creator can act now. Kept
// in one place so the order list and the detail surface never disagree on what a status means.
export type OrderTone = 'action' | 'waiting' | 'success' | 'ended';

export interface CreatorOrderView {
  label: string;
  tone: OrderTone;
  needsDelivery: boolean; // the creator can (re)submit work right now
}

export function creatorOrderView(o: Pick<CreatorOrder, 'order_status' | 'content_status'>): CreatorOrderView {
  switch (o.order_status) {
    case 'in_progress':
      return { label: 'Needs delivery', tone: 'action', needsDelivery: true };
    case 'revision_requested':
      return { label: 'Revision requested', tone: 'action', needsDelivery: true };
    case 'submitted':
      return { label: 'Awaiting approval', tone: 'waiting', needsDelivery: false };
    case 'completed':
      return { label: 'Completed & paid', tone: 'success', needsDelivery: false };
    case 'cancelled':
    case 'refunded':
      return { label: 'Refunded', tone: 'ended', needsDelivery: false };
    case 'disputed':
      return { label: 'Disputed', tone: 'action', needsDelivery: false };
    default:
      return { label: 'Awaiting payment', tone: 'ended', needsDelivery: false };
  }
}

// Only let an http(s) link reach an href — defence in depth against a stored javascript:/data: URL (the RPC
// already rejects these, but never render an untrusted string straight into href).
export function safeHref(url: string | undefined | null): string {
  const u = (url ?? '').trim();
  return /^https?:\/\//i.test(u) ? u : '#';
}

// Brand palette only (no gray — see the app theme rules). Mirrors the tones GuestOrderPage uses so the buyer
// and creator see the same colour language.
export const orderToneClasses: Record<OrderTone, string> = {
  action: 'border-landing-pink-line bg-landing-pink-soft text-landing-pink-ink',
  waiting: 'border-border bg-landing-lilac text-landing-ink',
  success: 'border-landing-mint-line bg-landing-mint-soft text-landing-mint-ink',
  ended: 'border-border bg-card text-muted-foreground',
};
