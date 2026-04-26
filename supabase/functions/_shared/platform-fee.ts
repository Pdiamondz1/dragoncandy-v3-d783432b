export const PLATFORM_FEE_RATE = 0.05;

export function calculatePlatformFee(amountDollars: number): {
  feeCents: number;
  netPayoutDollars: number;
  feeDollars: number;
} {
  const feeDollars = amountDollars * PLATFORM_FEE_RATE;
  return {
    feeCents: Math.round(feeDollars * 100),
    netPayoutDollars: amountDollars - feeDollars,
    feeDollars,
  };
}
