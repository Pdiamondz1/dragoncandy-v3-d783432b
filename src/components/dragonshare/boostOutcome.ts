// src/components/dragonshare/boostOutcome.ts
export type BoostOutcome =
  | { kind: 'checkout'; url: string }
  | { kind: 'queued' }
  | { kind: 'success'; creatorPayoutCents?: number };

/** Maps a boost-payment edge function response to a UI outcome. */
export function resolveBoostOutcome(data: unknown): BoostOutcome {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.checkout_url === 'string') return { kind: 'checkout', url: d.checkout_url };
  if (d.error === 'CREATOR_PAYOUT_NOT_READY' || d.queued === true) return { kind: 'queued' };
  return { kind: 'success', creatorPayoutCents: d.creator_payout_cents as number | undefined };
}
