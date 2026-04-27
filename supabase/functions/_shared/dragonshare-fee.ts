export const DRAGONSHARE_FEE_RATE = 0.20;

export function calculateDragonShareFee(amountCents: number): {
  platformFeeCents: number;
  creatorPayoutCents: number;
} {
  const platformFeeCents = Math.round(amountCents * DRAGONSHARE_FEE_RATE);
  const creatorPayoutCents = amountCents - platformFeeCents;
  return { platformFeeCents, creatorPayoutCents };
}
